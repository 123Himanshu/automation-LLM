import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ContextBuilderService } from './context-builder.service';
import { PromptBuilderService } from './prompt-builder.service';
import { OpenAIClientService } from './openai-client.service';
import { AIAuditService } from './ai-audit.service';
import { ConcurrencyGuardService } from './concurrency-guard.service';
import { WorkbookService } from '../workbook/workbook.service';
import { ActionService } from '../action/action.service';
import type { AIContext, AIToolCall, ChatMessage, Action } from '@excelflow/shared';
import { ACTION_LIMITS, sanitizeSheetName } from '@excelflow/shared';
import { createId } from '@paralleldrive/cuid2';

interface PromptRequest {
  workbookId: string;
  message: string;
  activeSheet: string;
  selectedRange?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface LLMEditResponse {
  message: string;
  plan?: string[];
  actions?: Action[];
  needsClarification?: boolean;
  requiresConfirmation?: boolean;
  estimatedImpact?: {
    cellsAffected: number;
    sheetsAffected: string[];
    createsNewSheet: boolean;
    overwritesData: boolean;
  };
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(
    private readonly contextBuilder: ContextBuilderService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly openai: OpenAIClientService,
    private readonly audit: AIAuditService,
    private readonly concurrency: ConcurrencyGuardService,
    private readonly workbookService: WorkbookService,
    private readonly actionService: ActionService,
  ) {}

  async processPrompt(request: PromptRequest): Promise<ChatMessage> {
    // Acquire per-workbook lock (Fixes Problem 13)
    const release = await this.concurrency.acquire(request.workbookId);
    try {
      return await this.processPromptInternal(request);
    } finally {
      release();
    }
  }

  private async processPromptInternal(request: PromptRequest): Promise<ChatMessage> {
    const workbook = await this.workbookService.getById(request.workbookId);
    const sheets = await this.workbookService.getSheets(request.workbookId);

    if (sheets.length === 0) {
      return {
        id: createId(),
        role: 'assistant',
        content: 'This workbook has no sheets. Upload a file first or create a sheet.',
        timestamp: new Date().toISOString(),
      };
    }

    const context = this.contextBuilder.buildContext(
      request.workbookId,
      sheets,
      request.activeSheet,
      workbook.classification as 'normal' | 'large' | 'heavy',
      request.selectedRange,
    );

    if (!this.openai.isAvailable()) {
      return this.buildFallbackResponse(request.message, context);
    }

    try {
      const systemPrompt = this.promptBuilder.buildEditSystemPrompt(context);
      this.logger.debug(`System prompt length: ${systemPrompt.length} chars`);
      this.logger.debug(`Sample rows per sheet: ${context.sheets.map((s) => `${s.name}=${s.sampleRows.length}`).join(', ')}`);

      // Build conversation history for OpenAI (keeps context across messages)
      const conversationHistory = (request.history ?? []).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const llmResponse = await this.openai.chat({
        systemPrompt,
        userMessage: request.message,
        conversationHistory,
        responseFormat: 'json',
        temperature: 0.1,
      });

      this.logger.log(`AI tokens used: ${llmResponse.usage?.totalTokens ?? 'unknown'}, finishReason: ${llmResponse.finishReason}`);

      // Detect truncated responses (LLM hit token limit)
      if (llmResponse.finishReason === 'length') {
        this.logger.warn(
          `AI response truncated (finishReason=length). Tokens: ${llmResponse.usage?.completionTokens ?? '?'}/${llmResponse.usage?.totalTokens ?? '?'}. Response may contain incomplete JSON.`,
        );
        return {
          id: createId(),
          role: 'assistant',
          content:
            'My response was too large and got cut off. Please try a more specific request ' +
            '(e.g., summarize fewer columns, or ask about a specific aspect of the data). ' +
            'This helps me keep the response within limits.',
          timestamp: new Date().toISOString(),
        };
      }

      const parsed = this.parseLLMResponse(llmResponse.content);

      // If LLM returned actions, execute them through the action engine
      if (parsed.actions && parsed.actions.length > 0 && !parsed.needsClarification) {
        const shouldConfirm = parsed.requiresConfirmation === true ||
          (parsed.estimatedImpact && parsed.estimatedImpact.cellsAffected > 1000) ||
          (parsed.estimatedImpact && parsed.estimatedImpact.overwritesData);

        const toolCall: AIToolCall = {
          tool: 'apply_actions',
          plan: parsed.plan ?? [],
          actions: parsed.actions,
          estimatedImpact: parsed.estimatedImpact ?? {
            cellsAffected: parsed.actions.length,
            sheetsAffected: [],
            createsNewSheet: false,
            overwritesData: false,
          },
          requiresConfirmation: shouldConfirm ?? false,
        };

        // If confirmation required, return pending tool call without executing
        if (shouldConfirm) {
          return {
            id: createId(),
            role: 'assistant',
            content: parsed.message + '\n\n⚠️ This operation requires your confirmation before proceeding.',
            toolCall,
            timestamp: new Date().toISOString(),
          };
        }

        const execResult = await this.executeActions(
          request.workbookId,
          parsed.actions,
          parsed.plan ?? [],
          false,
          parsed.estimatedImpact,
        );

        const statusMsg = execResult.success
          ? `\n\n✅ Applied ${parsed.actions.length} action(s). Revision: v${execResult.version}`
          : `\n\n❌ Failed to apply: ${execResult.error}`;

        return {
          id: createId(),
          role: 'assistant',
          content: parsed.message + statusMsg,
          toolCall: execResult.success ? { ...toolCall, requiresConfirmation: false } : undefined,
          timestamp: new Date().toISOString(),
        };
      }

      // No actions — just a text response
      return {
        id: createId(),
        role: 'assistant',
        content: parsed.message,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error(`AI prompt failed: ${err instanceof Error ? err.message : 'unknown'}`);
      return {
        id: createId(),
        role: 'assistant',
        content: `I encountered an error processing your request: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async executeToolCall(
    workbookId: string,
    toolCall: AIToolCall,
  ): Promise<{ success: boolean; revisionId?: string; error?: string }> {
    if (toolCall.requiresConfirmation) {
      throw new BadRequestException('This operation requires user confirmation before execution');
    }

    if (toolCall.estimatedImpact.cellsAffected > ACTION_LIMITS.AI_ASYNC_THRESHOLD) {
      this.logger.warn(`AI operation affects ${toolCall.estimatedImpact.cellsAffected} cells — should be async`);
    }

    return this.executeActions(workbookId, toolCall.actions, toolCall.plan, false, toolCall.estimatedImpact);
  }

  private async executeActions(
    workbookId: string,
    actions: Action[],
    plan: string[],
    requiresConfirmation: boolean,
    estimatedImpact?: LLMEditResponse['estimatedImpact'],
  ): Promise<{ success: boolean; revisionId?: string; version?: number; error?: string }> {
    if (requiresConfirmation) {
      return { success: false, error: 'Operation requires user confirmation' };
    }

    try {
      // Split: if batch has CREATE_SHEET, apply it first, then resolve new sheet IDs
      const createSheetActions = actions.filter((a) => a.type === 'CREATE_SHEET');
      const otherActions = actions.filter((a) => a.type !== 'CREATE_SHEET');

      this.logger.log(
        `Executing ${actions.length} actions (${createSheetActions.length} CREATE_SHEET, ${otherActions.length} other)`,
      );

      let revisionId = 'latest';
      let version = 0;

      if (createSheetActions.length > 0) {
        const createResult = await this.actionService.applyBatch({
          workbookId, revisionId, actions: createSheetActions, source: 'ai',
          metadata: { plan, phase: 'create_sheets' },
        });
        revisionId = createResult.revisionId;
        version = createResult.version;
        this.logger.log(`Created ${createSheetActions.length} sheet(s), rev v${version}`);
      }

      if (otherActions.length > 0) {
        // Build a name→ID map from ALL current sheets (includes newly created ones)
        const sheets = await this.workbookService.getSheets(workbookId);
        const nameToId = new Map<string, string>();
        for (const s of sheets) {
          nameToId.set(s.name, s.id);
        }
        this.logger.log(
          `Phase 2: Resolving sheetIds. Available sheets: ${sheets.map((s) => `"${s.name}"→${s.id}`).join(', ')}`,
        );

        // Log what sheetIds the LLM used
        const usedSheetIds = new Set<string>();
        for (const a of otherActions) {
          if ('sheetId' in a) usedSheetIds.add((a as Record<string, unknown>)['sheetId'] as string);
        }
        this.logger.log(`LLM used sheetIds: ${[...usedSheetIds].join(', ')}`);

        // Replace sheet names used as IDs with actual cuid IDs
        const resolved = this.resolveSheetIds(otherActions, nameToId);
        this.logger.log(`Phase 2: Applying ${resolved.length} actions`);
        const result = await this.actionService.applyBatch({
          workbookId, revisionId, actions: resolved, source: 'ai',
          metadata: { plan, estimatedImpact },
        });
        revisionId = result.revisionId;
        version = result.version;

        // Run post-action audit on affected sheets
        const affectedSheetIds = this.collectAffectedSheetIds(resolved, nameToId);
        for (const sheetId of affectedSheetIds) {
          const sheetActions = resolved.filter(
            (a) => 'sheetId' in a && (a as Record<string, unknown>)['sheetId'] === sheetId,
          );
          const auditResult = await this.audit.auditSheet(
            workbookId, sheetId, sheetActions, revisionId,
          );
          if (!auditResult.passed) {
            this.logger.warn(`[AI Audit] ${auditResult.message}`);
          }
        }

        return { success: true, revisionId, version };
      }

      return { success: true, revisionId, version };
    } catch (err) {
      let errorMsg = err instanceof Error ? err.message : 'AI action failed';
      // Extract validation details from BadRequestException
      if (err instanceof BadRequestException) {
        const response = err.getResponse();
        if (typeof response === 'object' && response !== null && 'details' in response) {
          const details = (response as Record<string, unknown>)['details'];
          errorMsg += `: ${JSON.stringify(details)}`;
        }
      }
      this.logger.error(`AI action execution failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /** Replace sheet names used as IDs with actual sheet IDs */
  private resolveSheetIds(actions: Action[], nameToId: Map<string, string>): Action[] {
    if (nameToId.size === 0) return actions;
    return actions.map((a) => {
      if ('sheetId' in a) {
        const action = a as Record<string, unknown>;
        const sheetId = action['sheetId'] as string;
        // Try exact match first, then sanitized name (handles truncation to 31 chars)
        const resolved = nameToId.get(sheetId) ?? nameToId.get(sanitizeSheetName(sheetId));
        if (resolved && resolved !== sheetId) {
          this.logger.debug(`Resolved sheetId "${sheetId}" → "${resolved}"`);
          return { ...a, sheetId: resolved } as Action;
        }
      }
      return a;
    });
  }

  /** Collect unique sheet IDs from resolved actions */
  private collectAffectedSheetIds(
    actions: Action[],
    _nameToId: Map<string, string>,
  ): Set<string> {
    const ids = new Set<string>();
    for (const a of actions) {
      if ('sheetId' in a) {
        const sheetId = (a as Record<string, unknown>)['sheetId'] as string;
        ids.add(sheetId);
      }
    }
    return ids;
  }

  private parseLLMResponse(raw: string): LLMEditResponse {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        return { message: raw, actions: [] };
      }
      const obj = parsed as Record<string, unknown>;
      return {
        message: typeof obj['message'] === 'string' ? obj['message'] : raw,
        plan: Array.isArray(obj['plan']) ? (obj['plan'] as string[]) : undefined,
        actions: Array.isArray(obj['actions']) ? (obj['actions'] as Action[]) : [],
        needsClarification: obj['needsClarification'] === true,
        requiresConfirmation: obj['requiresConfirmation'] === true,
        estimatedImpact: obj['estimatedImpact'] as LLMEditResponse['estimatedImpact'],
      };
    } catch (e) {
      // If LLM didn't return valid JSON, treat as plain text — log for debugging truncation issues
      this.logger.warn(
        `Failed to parse LLM response as JSON (length=${raw.length}). ` +
        `First 200 chars: ${raw.slice(0, 200)}... Last 100 chars: ...${raw.slice(-100)}`,
      );
      return { message: raw, actions: [] };
    }
  }

  private buildFallbackResponse(message: string, context: AIContext): ChatMessage {
    const sheetInfo = context.sheets
      .map((s) =>
        `"${s.name}" (${s.rowCount} rows, cols: ${s.headers.slice(0, 5).join(', ')}${s.headers.length > 5 ? '...' : ''})`,
      )
      .join('; ');

    return {
      id: createId(),
      role: 'assistant',
      content:
        `I can see your workbook has ${context.sheets.length} sheet(s): ${sheetInfo}. ` +
        `Classification: ${context.classification}. ` +
        `AI_API_KEY is not configured — set it in .env to enable full AI capabilities.`,
      timestamp: new Date().toISOString(),
    };
  }
}
