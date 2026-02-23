import type { ColumnType, CellValue } from './cell-types';

/** Precise structural map of a sheet — gives AI everything it needs to write correct formulas */
export interface SheetBlueprint {
  sheetId: string;
  sheetName: string;
  /** Sheet name escaped for formula references, e.g., "'My Sheet'" */
  escapedSheetName: string;
  /** First row of data (typically 2, after header row 1) */
  dataStartRow: number;
  /** Last row with data */
  dataEndRow: number;
  /** Total data rows (excludes header) */
  totalDataRows: number;
  /** Ordered column mappings */
  columnMap: ColumnMapping[];
  /** Merge ranges in A1:B2 notation */
  mergeRanges: string[];
  /** Whether the sheet has any merged cells */
  hasMerges: boolean;
  /** All sheet names in the workbook (for conflict avoidance) */
  existingSheetNames: string[];
}

/** Mapping of a single column — letter, header, type, and unique values */
export interface ColumnMapping {
  /** Excel column letter: "A", "B", "AA", etc. */
  letter: string;
  /** Header text from row 1 */
  header: string;
  /** Detected column type */
  type: ColumnType;
  /** For category columns: ALL unique values exactly as they appear in data */
  uniqueValues?: string[];
  /** Number format hint: "percentage", "currency", "decimal", "integer", "general" */
  numberFormat?: string;
  /** 3-5 sample values for non-category columns */
  sampleValues?: CellValue[];
}
