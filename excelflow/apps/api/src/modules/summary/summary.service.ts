import { Injectable, Logger } from '@nestjs/common';
import { ColumnDetectorService } from './column-detector.service';
import { PivotBuilderService } from './pivot-builder.service';
import { WorkbookService } from '../workbook/workbook.service';
import { ActionService } from '../action/action.service';
import type { Sheet, CellValue, ActionBatch, Action } from '@excelflow/shared';
import { colIndexToLetter, buildCellRef } from '@excelflow/shared';

interface SummaryOptions {
  workbookId: string;
  scope: 'selection' | 'active_sheet' | 'all_sheets';
  outputLocation: 'new_sheet' | 'same_sheet';
  depth: 'basic' | 'detailed';
  mode?: 'standard' | 'pivot';
  activeSheet?: string;
  selectedRange?: string;
  selectedColumns?: string[];
  pivotRowField?: string;
  pivotColumnField?: string;
  pivotValueField?: string;
  pivotAggregation?: 'count' | 'sum' | 'average' | 'min' | 'max';
}

/** Result from LLM-based summary generation */
interface LLMSummaryResult {
  sheetName: string;
  actions: Action[];
  message: string;
}

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);

  // Injected lazily to avoid circular dependency (AI module imports Summary module)
  private llmSummaryFn: ((
    workbookId: string,
    scope: string,
    activeSheet?: string,
    selectedColumns?: string[],
  ) => Promise<LLMSummaryResult>) | null = null;

  // Injected lazily from AI module for post-action verification
  private auditSheetFn: ((
    workbookId: string,
    sheetId: string,
    actions: Action[],
    revisionId: string,
  ) => Promise<{ passed: boolean; correctionsMade: number; message: string }>) | null = null;

  constructor(
    private readonly detector: ColumnDetectorService,
    private readonly pivotBuilder: PivotBuilderService,
    private readonly workbookService: WorkbookService,
    private readonly actionService: ActionService,
  ) {}

  /** Called by AIModule to inject the LLM summary capability */
  setLLMSummaryFunction(fn: typeof this.llmSummaryFn): void {
    this.llmSummaryFn = fn;
  }

  /** Called by AIModule to inject the audit capability */
  setAuditFunction(fn: typeof this.auditSheetFn): void {
    this.auditSheetFn = fn;
  }

  async generateSummary(options: SummaryOptions) {
    // Route to pivot mode if requested
    if (options.mode === 'pivot') {
      return this.generatePivotSummary(options);
    }
    // If LLM is available, use it for smarter summaries
    if (this.llmSummaryFn) {
      return this.generateLLMSummary(options);
    }
    // Fallback: deterministic summary
    return this.generateDeterministicSummary(options);
  }

  private async generateLLMSummary(options: SummaryOptions) {
    try {
      const result = await this.llmSummaryFn!(
        options.workbookId,
        options.scope,
        options.activeSheet,
        options.selectedColumns,
      );

      const sheets = await this.workbookService.getSheets(options.workbookId);
      const sheetName = this.getUniqueSummaryName(sheets);

      // Create the summary sheet
      const createResult = await this.actionService.applyBatch({
        workbookId: options.workbookId,
        revisionId: 'latest',
        actions: [{ type: 'CREATE_SHEET', name: sheetName }],
        source: 'system',
        metadata: { description: 'AI Quick Summary generation' },
      });

      // Get the new sheet ID
      const updatedSheets = await this.workbookService.getSheets(options.workbookId);
      const summarySheet = updatedSheets.find((s) => s.name === sheetName);
      if (!summarySheet) return createResult;

      // Replace __SUMMARY__ placeholder with actual sheet ID
      const resolvedActions = result.actions.map((a) => {
        if ('sheetId' in a && (a as Record<string, unknown>)['sheetId'] === '__SUMMARY__') {
          return { ...a, sheetId: summarySheet.id };
        }
        return a;
      });

      if (resolvedActions.length === 0) {
        this.logger.warn('LLM returned no summary actions, falling back to deterministic');
        return this.writeDeterministicData(options, summarySheet.id, createResult.revisionId);
      }

      const applyResult = await this.actionService.applyBatch({
        workbookId: options.workbookId,
        revisionId: createResult.revisionId,
        actions: resolvedActions,
        source: 'system',
        metadata: { description: result.message },
      });

      // Run post-action audit to verify formulas evaluated correctly
      if (this.auditSheetFn) {
        const auditResult = await this.auditSheetFn(
          options.workbookId,
          summarySheet.id,
          resolvedActions,
          applyResult.revisionId,
        );
        if (!auditResult.passed) {
          this.logger.warn(`[Summary Audit] ${auditResult.message}`);
        } else if (auditResult.correctionsMade > 0) {
          this.logger.log(`[Summary Audit] ${auditResult.message}`);
        }
      }

      return applyResult;
    } catch (err) {
      this.logger.error(`LLM summary failed, falling back: ${err instanceof Error ? err.message : 'unknown'}`);
      return this.generateDeterministicSummary(options);
    }
  }

  private async generateDeterministicSummary(options: SummaryOptions) {
    const sheets = await this.workbookService.getSheets(options.workbookId);
    const targetSheets = this.resolveTargetSheets(sheets, options);
    const summaryData = this.buildSummaryData(targetSheets, options.selectedColumns);

    const sheetName = this.getUniqueSummaryName(sheets);
    const createResult = await this.actionService.applyBatch({
      workbookId: options.workbookId,
      revisionId: 'latest',
      actions: [{ type: 'CREATE_SHEET', name: sheetName }],
      source: 'system',
      metadata: { description: 'Quick Summary generation' },
    });

    const updatedSheets = await this.workbookService.getSheets(options.workbookId);
    const summarySheet = updatedSheets.find((s) => s.name === sheetName);
    if (!summarySheet) return createResult;

    return this.writeDeterministicData(options, summarySheet.id, createResult.revisionId, summaryData);
  }

  private async writeDeterministicData(
    options: SummaryOptions,
    sheetId: string,
    revisionId: string,
    summaryData?: CellValue[][],
  ) {
    if (!summaryData) {
      const sheets = await this.workbookService.getSheets(options.workbookId);
      const targetSheets = this.resolveTargetSheets(sheets, options);
      summaryData = this.buildSummaryData(targetSheets, options.selectedColumns);
    }

    const setCellActions = summaryData.flatMap((row, rowIdx) =>
      row.map((value, colIdx) => ({
        type: 'SET_CELL' as const,
        sheetId,
        cellRef: buildCellRef(colIdx, rowIdx),
        value,
      })),
    );

    return this.actionService.applyBatch({
      workbookId: options.workbookId,
      revisionId,
      actions: setCellActions,
      source: 'system',
      metadata: { description: 'Summary data write' },
    });
  }

  private buildSummaryData(sheets: Sheet[], selectedColumns?: string[]): CellValue[][] {
    const data: CellValue[][] = [
      ['Sheet', 'Column', 'Type', 'Count', 'Missing', 'Unique', 'Min', 'Max', 'Mean', 'Sum'],
    ];

    for (const sheet of sheets) {
      const { headers, columnValues } = this.extractColumns(sheet);

      for (let i = 0; i < headers.length; i++) {
        const header = headers[i] ?? `Col ${colIndexToLetter(i)}`;

        // If user selected specific columns, skip unselected ones
        if (selectedColumns && selectedColumns.length > 0 && !selectedColumns.includes(header)) {
          continue;
        }

        const values = columnValues[i] ?? [];
        const type = this.detector.detectType(values);
        const stats = this.detector.computeStats(header, values, type);

        data.push([
          sheet.name, header, type,
          stats.count, stats.missing, stats.unique,
          stats.min ?? null, stats.max ?? null,
          stats.mean ?? null, stats.sum ?? null,
        ]);
      }
    }
    return data;
  }

  private resolveTargetSheets(sheets: Sheet[], options: SummaryOptions): Sheet[] {
    if (options.scope === 'all_sheets') return sheets;
    if (options.activeSheet) {
      const found = sheets.find((s) => s.id === options.activeSheet || s.name === options.activeSheet);
      return found ? [found] : sheets.slice(0, 1);
    }
    return sheets.slice(0, 1);
  }

  private extractColumns(sheet: Sheet): { headers: string[]; columnValues: CellValue[][] } {
    const entries = Object.entries(sheet.cells);
    if (entries.length === 0) return { headers: [], columnValues: [] };

    let maxCol = 0;
    for (const [ref] of entries) {
      const match = ref.match(/^([A-Z]+)/);
      if (match?.[1]) {
        let col = 0;
        for (let i = 0; i < match[1].length; i++) {
          col = col * 26 + (match[1].charCodeAt(i) - 64);
        }
        maxCol = Math.max(maxCol, col);
      }
    }

    const headers: string[] = [];
    const columnValues: CellValue[][] = [];

    for (let c = 0; c < maxCol; c++) {
      const letter = colIndexToLetter(c);
      const headerCell = sheet.cells[`${letter}1`];
      headers.push(headerCell?.computedValue?.toString() ?? headerCell?.value?.toString() ?? `Col ${letter}`);

      const values: CellValue[] = [];
      for (let r = 2; r <= sheet.usedRange.endRow + 1; r++) {
        const cell = sheet.cells[`${letter}${r}`];
        values.push(cell?.computedValue ?? cell?.value ?? null);
      }
      columnValues.push(values);
    }
    return { headers, columnValues };
  }

  /** Returns available column headers for the frontend checkbox UI */
  async getAvailableColumns(workbookId: string, activeSheet?: string): Promise<string[]> {
    const sheets = await this.workbookService.getSheets(workbookId);
    const target = activeSheet
      ? sheets.find((s) => s.id === activeSheet || s.name === activeSheet)
      : sheets[0];
    if (!target) return [];
    const { headers } = this.extractColumns(target);
    return headers;
  }

  private async generatePivotSummary(options: SummaryOptions) {
    const { pivotRowField, pivotColumnField, pivotValueField, pivotAggregation } = options;
    if (!pivotRowField || !pivotColumnField || !pivotValueField) {
      throw new Error('Pivot mode requires pivotRowField, pivotColumnField, and pivotValueField');
    }

    const sheets = await this.workbookService.getSheets(options.workbookId);
    const targetSheet = this.resolveTargetSheets(sheets, options)[0];
    if (!targetSheet) throw new Error('No target sheet found for pivot');

    const pivotResult = this.pivotBuilder.buildPivot(targetSheet, {
      rowField: pivotRowField,
      columnField: pivotColumnField,
      valueField: pivotValueField,
      aggregation: pivotAggregation ?? 'count',
    });

    const sheetName = this.getUniquePivotName(sheets);
    const createResult = await this.actionService.applyBatch({
      workbookId: options.workbookId,
      revisionId: 'latest',
      actions: [{ type: 'CREATE_SHEET', name: sheetName }],
      source: 'system',
      metadata: { description: `Pivot Table: ${pivotRowField} × ${pivotColumnField} (${pivotAggregation ?? 'count'} of ${pivotValueField})` },
    });

    const updatedSheets = await this.workbookService.getSheets(options.workbookId);
    const pivotSheet = updatedSheets.find((s) => s.name === sheetName);
    if (!pivotSheet) return createResult;

    const dataActions = this.pivotBuilder.dataToActions(pivotResult.data, pivotSheet.id);
    const fmtActions = this.pivotBuilder.formatActions(pivotResult.data, pivotSheet.id);

    return this.actionService.applyBatch({
      workbookId: options.workbookId,
      revisionId: createResult.revisionId,
      actions: [...dataActions, ...fmtActions],
      source: 'system',
      metadata: { description: `Pivot data: ${pivotRowField} × ${pivotColumnField}` },
    });
  }

  private getUniquePivotName(sheets: Sheet[]): string {
    const names = new Set(sheets.map((s) => s.name));
    if (!names.has('Pivot')) return 'Pivot';
    let i = 2;
    while (names.has(`Pivot (${i})`)) i++;
    return `Pivot (${i})`;
  }

  private getUniqueSummaryName(sheets: Sheet[]): string {
    const names = new Set(sheets.map((s) => s.name));
    if (!names.has('Summary')) return 'Summary';
    let i = 2;
    while (names.has(`Summary (${i})`)) i++;
    return `Summary (${i})`;
  }
}
