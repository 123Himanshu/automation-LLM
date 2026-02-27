import { z } from 'zod';

export const cellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const cellRangeSchema = z.object({
  startRow: z.number().int().min(0),
  startCol: z.number().int().min(0),
  endRow: z.number().int().min(0),
  endCol: z.number().int().min(0),
}).refine(
  (r) => r.endRow >= r.startRow && r.endCol >= r.startCol,
  { message: 'End must be >= start in range' },
);

export const cellFormatSchema = z.object({
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  fontSize: z.number().int().min(6).max(72).optional(),
  fontColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  numberFormat: z.string().max(50).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
}).strict();

export type CellValueInput = z.infer<typeof cellValueSchema>;
export type CellRangeInput = z.infer<typeof cellRangeSchema>;
export type CellFormatInput = z.infer<typeof cellFormatSchema>;
