import { z } from 'zod';

export const pdfPrintSettingsSchema = z.object({
  scope: z.enum(['active_sheet', 'selected_range', 'all_sheets', 'summary']),
  orientation: z.enum(['portrait', 'landscape']),
  scaling: z.enum(['fit_to_page', 'actual_size', 'custom']),
  customScalePercent: z.number().int().min(10).max(400).optional(),
  gridlines: z.boolean(),
  repeatHeaders: z.boolean(),
  sheetIds: z.array(z.string().min(1)).optional(),
});

export const exportRequestSchema = z.object({
  workbookId: z.string().min(1),
  revisionId: z.string().min(1),
  format: z.enum(['xlsx', 'pdf']),
  pdfSettings: pdfPrintSettingsSchema.optional(),
  sheetIds: z.array(z.string().min(1)).optional(),
}).refine(
  (data) => data.format !== 'pdf' || data.pdfSettings !== undefined,
  { message: 'pdfSettings required when format is pdf', path: ['pdfSettings'] },
);

export type PdfPrintSettingsInput = z.infer<typeof pdfPrintSettingsSchema>;
export type ExportRequestInput = z.infer<typeof exportRequestSchema>;
