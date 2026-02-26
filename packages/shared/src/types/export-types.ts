/** PDF print settings */
export interface PdfPrintSettings {
  scope: 'active_sheet' | 'selected_range' | 'all_sheets' | 'summary';
  orientation: 'portrait' | 'landscape';
  scaling: 'fit_to_page' | 'actual_size' | 'custom';
  customScalePercent?: number;
  gridlines: boolean;
  repeatHeaders: boolean;
  /** Optional list of sheet IDs to include. If omitted, scope rules apply. */
  sheetIds?: string[];
}

/** Export request payload */
export interface ExportRequest {
  workbookId: string;
  revisionId: string;
  format: 'xlsx' | 'pdf';
  pdfSettings?: PdfPrintSettings;
  /** Optional list of sheet IDs to export. If omitted, all sheets are exported. */
  sheetIds?: string[];
}

/** Export result */
export interface ExportResult {
  jobId?: string;
  downloadUrl?: string;
  previewUrl?: string;
  fileName?: string;
  isAsync: boolean;
}
