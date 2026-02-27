import { z } from 'zod';

export const chatHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export const aiPromptSchema = z.object({
  workbookId: z.string().min(1),
  message: z.string().min(1).max(10000),
  activeSheet: z.string().min(1),
  selectedRange: z.string().optional(),
  history: z.array(chatHistoryMessageSchema).max(50).optional(),
});

/** Body-only schema (workbookId comes from URL param) */
export const aiPromptBodySchema = aiPromptSchema.omit({ workbookId: true });

export const summaryRequestSchema = z.object({
  workbookId: z.string().min(1),
  scope: z.enum(['selection', 'active_sheet', 'all_sheets']),
  outputLocation: z.enum(['new_sheet', 'same_sheet']).default('new_sheet'),
  depth: z.enum(['basic', 'detailed']).default('basic'),
  mode: z.enum(['standard', 'pivot']).default('standard'),
  autoExport: z.enum(['none', 'pdf', 'xlsx']).default('none'),
  selectedRange: z.string().optional(),
  activeSheet: z.string().optional(),
  selectedColumns: z.array(z.string()).optional(),
  /** For pivot mode: which column to group rows by */
  pivotRowField: z.string().optional(),
  /** For pivot mode: which column values become pivot columns */
  pivotColumnField: z.string().optional(),
  /** For pivot mode: which column to aggregate */
  pivotValueField: z.string().optional(),
  /** For pivot mode: aggregation function */
  pivotAggregation: z.enum(['count', 'sum', 'average', 'min', 'max']).default('count'),
});

/** Body-only schema (workbookId comes from URL param) */
export const summaryRequestBodySchema = summaryRequestSchema.omit({ workbookId: true });

export type AiPromptInput = z.infer<typeof aiPromptSchema>;
export type AiPromptBodyInput = z.infer<typeof aiPromptBodySchema>;
export type SummaryRequestInput = z.infer<typeof summaryRequestSchema>;
export type SummaryRequestBodyInput = z.infer<typeof summaryRequestBodySchema>;

/** Schema for the AI confirm endpoint body */
export const aiToolCallSchema = z.object({
  tool: z.literal('apply_actions'),
  plan: z.array(z.string()),
  actions: z.array(z.unknown()),
  estimatedImpact: z.object({
    cellsAffected: z.number(),
    sheetsAffected: z.array(z.string()),
    createsNewSheet: z.boolean(),
    overwritesData: z.boolean(),
  }),
  requiresConfirmation: z.boolean(),
});

export const aiConfirmBodySchema = z.object({
  toolCall: aiToolCallSchema,
});

export type AiConfirmBodyInput = z.infer<typeof aiConfirmBodySchema>;
