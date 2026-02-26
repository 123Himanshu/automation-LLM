import { z } from 'zod';
import { cellFormatSchema, cellRangeSchema, cellValueSchema } from './cell-schema';

const setCellAction = z.object({
  type: z.literal('SET_CELL'),
  sheetId: z.string().min(1),
  cellRef: z.string().regex(/^[A-Z]{1,3}\d{1,7}$/),
  value: cellValueSchema,
  formula: z.string().startsWith('=').max(8192).optional(),
});

const setRangeAction = z.object({
  type: z.literal('SET_RANGE'),
  sheetId: z.string().min(1),
  range: cellRangeSchema,
  values: z.array(z.array(cellValueSchema)),
});

const formatCellsAction = z.object({
  type: z.literal('FORMAT_CELLS'),
  sheetId: z.string().min(1),
  range: cellRangeSchema,
  format: cellFormatSchema.partial(),
});

const insertRowsAction = z.object({
  type: z.literal('INSERT_ROWS'),
  sheetId: z.string().min(1),
  startRow: z.number().int().min(0),
  count: z.number().int().min(1).max(10000),
});

const deleteRowsAction = z.object({
  type: z.literal('DELETE_ROWS'),
  sheetId: z.string().min(1),
  startRow: z.number().int().min(0),
  count: z.number().int().min(1).max(10000),
});

const insertColsAction = z.object({
  type: z.literal('INSERT_COLS'),
  sheetId: z.string().min(1),
  startCol: z.number().int().min(0),
  count: z.number().int().min(1).max(1000),
});

const deleteColsAction = z.object({
  type: z.literal('DELETE_COLS'),
  sheetId: z.string().min(1),
  startCol: z.number().int().min(0),
  count: z.number().int().min(1).max(1000),
});

const sortRangeAction = z.object({
  type: z.literal('SORT_RANGE'),
  sheetId: z.string().min(1),
  range: cellRangeSchema,
  column: z.number().int().min(0),
  direction: z.enum(['asc', 'desc']),
});

const createSheetAction = z.object({
  type: z.literal('CREATE_SHEET'),
  name: z.string().min(1).max(31),
});

const deleteSheetAction = z.object({
  type: z.literal('DELETE_SHEET'),
  sheetId: z.string().min(1),
});

const renameSheetAction = z.object({
  type: z.literal('RENAME_SHEET'),
  sheetId: z.string().min(1),
  name: z.string().min(1).max(31),
});

const mergeCellsAction = z.object({
  type: z.literal('MERGE_CELLS'),
  sheetId: z.string().min(1),
  range: cellRangeSchema,
});

const unmergeCellsAction = z.object({
  type: z.literal('UNMERGE_CELLS'),
  sheetId: z.string().min(1),
  range: cellRangeSchema,
});

export const actionSchema = z.discriminatedUnion('type', [
  setCellAction,
  setRangeAction,
  formatCellsAction,
  insertRowsAction,
  deleteRowsAction,
  insertColsAction,
  deleteColsAction,
  sortRangeAction,
  createSheetAction,
  deleteSheetAction,
  renameSheetAction,
  mergeCellsAction,
  unmergeCellsAction,
]);

export const actionBatchSchema = z.object({
  workbookId: z.string().min(1),
  revisionId: z.string().min(1),
  actions: z.array(actionSchema).min(1).max(5000),
  source: z.enum(['manual', 'ai', 'system']),
  metadata: z.record(z.unknown()).optional(),
});

/** Body-only schema (workbookId comes from URL param) */
export const actionBatchBodySchema = actionBatchSchema.omit({ workbookId: true });

export type ActionInput = z.infer<typeof actionSchema>;
export type ActionBatchInput = z.infer<typeof actionBatchSchema>;
export type ActionBatchBodyInput = z.infer<typeof actionBatchBodySchema>;
