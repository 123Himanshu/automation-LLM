import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { OpenAIClientService } from './openai-client.service';
import { ContextBuilderService } from './context-builder.service';
import { PromptBuilderService } from './prompt-builder.service';
import { CrossTabBuilderService } from './cross-tab-builder.service';
import { AIAuditService } from './ai-audit.service';
import { WorkbookService } from '../workbook/workbook.service';
import { SummaryService } from '../summary/summary.service';
import type { Action } from '@excelflow/shared';
import { colIndexToLetter, SUPPORTED_FORMULA_FUNCTIONS } from '@excelflow/shared';

interface LLMSummaryResult {
  sheetName: string;
  actions: Action[];
  message: string;
}

@Injectable()
export class AISummaryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AISummaryService.name);

  constructor(
    private readonly openai: OpenAIClientService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly crossTabBuilder: CrossTabBuilderService,
    private readonly auditService: AIAuditService,
    private readonly workbookService: WorkbookService,
    private readonly summaryService: SummaryService,
  ) {}

  onApplicationBootstrap(): void {
    // Wire the LLM summary function into the SummaryService
    // Using onApplicationBootstrap to ensure OpenAIClientService is fully initialized
    if (this.openai.isAvailable()) {
      this.summaryService.setLLMSummaryFunction(
        (workbookId, scope, activeSheet, selectedColumns) =>
          this.generateLLMSummary(workbookId, scope, activeSheet, selectedColumns),
      );
      this.logger.log('LLM summary function wired into SummaryService');
    } else {
      this.logger.warn('OpenAI not available — LLM summary disabled');
    }

    // Wire the audit function into the SummaryService
    this.summaryService.setAuditFunction(
      (workbookId, sheetId, actions, revisionId) =>
        this.auditService.auditSheet(workbookId, sheetId, actions, revisionId),
    );
    this.logger.log('Audit function wired into SummaryService');

    // Wire the LLM correction function into the AuditService (Phase 2 of audit)
    if (this.openai.isAvailable()) {
      this.auditService.setLLMCorrectionFunction(
        (errorDescription, sheetContext) =>
          this.generateLLMCorrection(errorDescription, sheetContext),
      );
      this.logger.log('LLM correction function wired into AuditService');
    }
  }

  async generateLLMSummary(
    workbookId: string,
    scope: string,
    activeSheet?: string,
    selectedColumns?: string[],
  ): Promise<LLMSummaryResult> {
    const workbook = await this.workbookService.getById(workbookId);
    const sheets = await this.workbookService.getSheets(workbookId);

    if (sheets.length === 0) {
      return { sheetName: 'Summary', actions: [], message: 'This workbook has no sheets to summarize.' };
    }

    // Guard: check if the target sheet has any data
    const targetCheck = activeSheet
      ? sheets.find((s) => s.id === activeSheet) ?? sheets[0]
      : sheets[0];
    if (targetCheck && Object.keys(targetCheck.cells).length === 0) {
      return { sheetName: 'Summary', actions: [], message: 'The selected sheet has no data to summarize.' };
    }

    const context = this.contextBuilder.buildContext(
      workbookId,
      sheets,
      activeSheet ?? sheets[0]?.id ?? '',
      workbook.classification as 'normal' | 'large' | 'heavy',
    );

    // Compute cross-tabulation data from raw sheet for accurate numbers
    const targetSheet = activeSheet
      ? sheets.find((s) => s.id === activeSheet) ?? sheets[0]
      : sheets[0];
    const crossTabData = targetSheet
      ? this.crossTabBuilder.buildCrossTabString(targetSheet)
      : undefined;

    // Build column letter mapping: header name → Excel column letter
    const sourceSheetName = targetSheet?.name;
    const columnLetterMap: Record<string, string> = {};
    if (targetSheet) {
      const maxCol = targetSheet.usedRange.endCol + 1;
      for (let c = 0; c < maxCol; c++) {
        const letter = colIndexToLetter(c);
        const headerCell = targetSheet.cells[`${letter}1`];
        const header = headerCell?.computedValue?.toString()
          ?? headerCell?.value?.toString();
        if (header) {
          columnLetterMap[header] = letter;
        }
      }
    }

    const systemPrompt = this.promptBuilder.buildSummarySystemPrompt(
      context, selectedColumns, crossTabData, sourceSheetName, columnLetterMap,
    );
    const userMessage = selectedColumns && selectedColumns.length > 0
      ? `Generate a detailed summary for these columns: ${selectedColumns.join(', ')}`
      : 'Generate a comprehensive summary of all columns in the spreadsheet. Analyze each column and provide the most relevant statistics.';

    const response = await this.openai.chat({
      systemPrompt,
      userMessage,
      responseFormat: 'json',
      temperature: 0.1,
      maxTokens: 16384,
    });

    this.logger.log(`Summary LLM tokens: ${response.usage?.totalTokens ?? 'unknown'}, finishReason: ${response.finishReason}`);
    this.logger.log(`Summary LLM raw response (first 500 chars): ${response.content.substring(0, 500)}`);

    // Detect truncated responses (LLM hit token limit)
    if (response.finishReason === 'length') {
      this.logger.warn(
        `Summary LLM response truncated (finishReason=length). Tokens: ${response.usage?.completionTokens ?? '?'}/${response.usage?.totalTokens ?? '?'}`,
      );
      return {
        sheetName: 'Summary',
        actions: [],
        message: 'The summary was too large and got cut off. Try selecting fewer columns or a simpler summary scope.',
      };
    }

    return this.parseSummaryResponse(response.content);
  }

  /**
   * Generate corrective actions via LLM for audit Phase 2.
   * Called when local auto-fix couldn't resolve formula errors.
   */
  private async generateLLMCorrection(
    errorDescription: string,
    sheetContext: string,
  ): Promise<Action[]> {
    const systemPrompt = `You are a formula correction assistant for ExcelFlow.
You receive a list of cells with formula errors and must return corrective SET_CELL actions.

${sheetContext}

RULES:
- Return ONLY a JSON object: { "actions": [...] }
- Each action: { "type": "SET_CELL", "sheetId": "__AUDIT__", "cellRef": "A1", "value": null, "formula": "=CORRECTED_FORMULA" }
- Use sheetId "__AUDIT__" — it will be resolved to the actual sheet ID.
- Fix the formula syntax, sheet references, or function names.
- If a formula is unfixable, replace it with a static value or descriptive text.
- ONLY use supported functions: ${SUPPORTED_FORMULA_FUNCTIONS.slice(0, 15).join(', ')}, etc.`;

    const response = await this.openai.chat({
      systemPrompt,
      userMessage: `Fix these formula errors:\n${errorDescription}`,
      responseFormat: 'json',
      temperature: 0.0,
      maxTokens: 4096,
    });

    try {
      const parsed = JSON.parse(response.content) as Record<string, unknown>;
      const actions = Array.isArray(parsed['actions']) ? (parsed['actions'] as Action[]) : [];
      this.logger.log(`LLM correction returned ${actions.length} fix action(s)`);
      return actions;
    } catch {
      this.logger.warn('Failed to parse LLM correction response');
      return [];
    }
  }

  private parseSummaryResponse(raw: string): LLMSummaryResult {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        this.logger.warn('LLM response is not an object');
        return { sheetName: 'Summary', actions: [], message: raw };
      }
      const obj = parsed as Record<string, unknown>;
      const actions = Array.isArray(obj['actions']) ? (obj['actions'] as Action[]) : [];
      this.logger.log(`Parsed LLM summary: ${actions.length} actions, sheetName="${obj['summarySheetName']}"`);
      if (actions.length === 0) {
        this.logger.warn(`LLM response keys: ${Object.keys(obj).join(', ')}`);
        this.logger.warn(`LLM actions field type: ${typeof obj['actions']}, isArray: ${Array.isArray(obj['actions'])}`);
      }
      return {
        sheetName: typeof obj['summarySheetName'] === 'string' ? obj['summarySheetName'] : 'Summary',
        actions,
        message: typeof obj['message'] === 'string' ? obj['message'] : 'Summary generated',
      };
    } catch (err) {
      this.logger.error(
        `Failed to parse LLM summary JSON: ${err instanceof Error ? err.message : 'unknown'}. ` +
        `Response length=${raw.length}. First 200 chars: ${raw.slice(0, 200)}... Last 100 chars: ...${raw.slice(-100)}`,
      );
      return { sheetName: 'Summary', actions: [], message: 'Failed to parse LLM summary response. Try a simpler request.' };
    }
  }
}
