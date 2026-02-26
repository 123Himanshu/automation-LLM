import { z } from 'zod';
import { cellValueSchema, cellRangeSchema } from './cell-schema';

/** Generic API response wrapper */
function apiResponse<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
  });
}

/** Workbook metadata (list/detail view) */
export const workbookMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  classification: z.enum(['normal', 'large', 'heavy']),
  sheetCount: z.number(),
  usedCells: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Sheet summary (from /sheets list endpoint) */
export const sheetSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  usedRange: cellRangeSchema,
  frozenRows: z.number().optional(),
  frozenCols: z.number().optional(),
});

/** Cell schema for response */
const cellSchema = z.object({
  value: cellValueSchema,
  formula: z.string().optional(),
  computedValue: cellValueSchema.optional(),
  format: z.object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    fontSize: z.number().optional(),
    fontColor: z.string().optional(),
    bgColor: z.string().optional(),
    numberFormat: z.string().optional(),
    alignment: z.enum(['left', 'center', 'right']).optional(),
    border: z.unknown().optional(),
  }).optional(),
  type: z.enum(['string', 'number', 'boolean', 'date', 'formula', 'empty']),
});

/** Full sheet data */
export const sheetDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  cells: z.record(cellSchema),
  merges: z.array(cellRangeSchema),
  columnWidths: z.record(z.number()),
  rowHeights: z.record(z.number()),
  frozenRows: z.number(),
  frozenCols: z.number(),
  usedRange: cellRangeSchema,
});


/** Action result response */
export const actionResultSchema = z.object({
  revisionId: z.string(),
  version: z.number(),
  changedCells: z.record(z.record(cellValueSchema)),
  warnings: z.array(z.string()),
});

/** Revision list item */
export const revisionMetaSchema = z.object({
  id: z.string(),
  version: z.number(),
  source: z.enum(['manual', 'ai', 'system']),
  description: z.string().nullable().optional(),
  createdAt: z.string(),
});

/** Chat message response */
export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  toolCall: z.unknown().optional(),
  timestamp: z.string(),
});

/** Export result */
export const exportResultSchema = z.object({
  jobId: z.string().optional(),
  downloadUrl: z.string().optional(),
  previewUrl: z.string().optional(),
  fileName: z.string().optional(),
  isAsync: z.boolean(),
});

/** Job status */
export const jobStatusSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  progress: z.number(),
  result: z.unknown().optional().nullable(),
  error: z.string().optional().nullable(),
});

/** Create workbook result */
export const createWorkbookResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  classification: z.enum(['normal', 'large', 'heavy']),
  sheetCount: z.number(),
  revisionId: z.string(),
});

// Pre-built API response wrappers
export const workbookMetaResponseSchema = apiResponse(workbookMetaSchema);
export const workbookListResponseSchema = apiResponse(z.array(workbookMetaSchema));
export const sheetListResponseSchema = apiResponse(z.array(sheetSummarySchema));
export const sheetDataResponseSchema = apiResponse(sheetDataSchema);
export const actionResultResponseSchema = apiResponse(actionResultSchema);
export const revisionListResponseSchema = apiResponse(z.array(revisionMetaSchema));
export const chatMessageResponseSchema = apiResponse(chatMessageSchema);
export const exportResultResponseSchema = apiResponse(exportResultSchema);
export const jobStatusResponseSchema = apiResponse(jobStatusSchema);
export const createWorkbookResponseSchema = apiResponse(createWorkbookResultSchema);
