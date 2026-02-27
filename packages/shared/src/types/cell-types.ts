/** Primitive cell value types */
export type CellValue = string | number | boolean | null;

/** Cell data type classification */
export const CELL_TYPES = ['string', 'number', 'boolean', 'date', 'formula', 'empty'] as const;
export type CellType = (typeof CELL_TYPES)[number];

/** Column type for summary/AI analysis */
export const COLUMN_TYPES = ['numeric', 'text', 'date', 'category', 'mixed', 'empty'] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

/** Text alignment options */
export const ALIGNMENTS = ['left', 'center', 'right'] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

/** Border style for a single edge */
export interface BorderEdge {
  style: 'thin' | 'medium' | 'thick' | 'dashed';
  color: string;
}

/** Full border configuration */
export interface BorderConfig {
  top?: BorderEdge;
  right?: BorderEdge;
  bottom?: BorderEdge;
  left?: BorderEdge;
}

/** Cell formatting */
export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  fontColor?: string;
  bgColor?: string;
  numberFormat?: string;
  alignment?: Alignment;
  border?: BorderConfig;
}

/** Single cell in the canonical model */
export interface Cell {
  value: CellValue;
  formula?: string;
  computedValue?: CellValue;
  format?: CellFormat;
  type: CellType;
}

/** Range reference (e.g., A1:Z100) */
export interface CellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

/** Merge range */
export interface MergeRange extends CellRange {}
