import type { Cell, CellRange, MergeRange } from './cell-types';

/** Workbook performance classification */
export const WORKBOOK_CLASSIFICATIONS = ['normal', 'large', 'heavy'] as const;
export type WorkbookClassification = (typeof WORKBOOK_CLASSIFICATIONS)[number];

/** Sheet in the canonical workbook model */
export interface Sheet {
  id: string;
  name: string;
  cells: Record<string, Cell>;
  merges: MergeRange[];
  columnWidths: Record<number, number>;
  rowHeights: Record<number, number>;
  frozenRows: number;
  frozenCols: number;
  usedRange: CellRange;
}

/** Full workbook model — single source of truth */
export interface Workbook {
  id: string;
  name: string;
  sheets: Sheet[];
  classification: WorkbookClassification;
  createdAt: string;
  updatedAt: string;
}

/** Metrics computed during upload for classification */
export interface WorkbookMetrics {
  usedCells: number;
  formulaCount: number;
  volatileCount: number;
  sheetCount: number;
  crossSheetDeps: number;
  maxColumns: number;
  mergeCount: number;
  styleDensity: number;
}

/** Lightweight workbook metadata (list view) */
export interface WorkbookMeta {
  id: string;
  name: string;
  classification: WorkbookClassification;
  sheetCount: number;
  usedCells: number;
  createdAt: string;
  updatedAt: string;
}
