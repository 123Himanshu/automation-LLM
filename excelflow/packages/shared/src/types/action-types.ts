import type { CellFormat, CellRange, CellValue } from './cell-types';

/** All possible action types (discriminated union) */
export type Action =
  | { type: 'SET_CELL'; sheetId: string; cellRef: string; value: CellValue; formula?: string }
  | { type: 'SET_RANGE'; sheetId: string; range: CellRange; values: CellValue[][] }
  | { type: 'FORMAT_CELLS'; sheetId: string; range: CellRange; format: Partial<CellFormat> }
  | { type: 'INSERT_ROWS'; sheetId: string; startRow: number; count: number }
  | { type: 'DELETE_ROWS'; sheetId: string; startRow: number; count: number }
  | { type: 'INSERT_COLS'; sheetId: string; startCol: number; count: number }
  | { type: 'DELETE_COLS'; sheetId: string; startCol: number; count: number }
  | {
      type: 'SORT_RANGE';
      sheetId: string;
      range: CellRange;
      column: number;
      direction: 'asc' | 'desc';
    }
  | { type: 'CREATE_SHEET'; name: string }
  | { type: 'DELETE_SHEET'; sheetId: string }
  | { type: 'RENAME_SHEET'; sheetId: string; name: string }
  | { type: 'MERGE_CELLS'; sheetId: string; range: CellRange }
  | { type: 'UNMERGE_CELLS'; sheetId: string; range: CellRange };

/** Source of an action batch */
export const ACTION_SOURCES = ['manual', 'ai', 'system'] as const;
export type ActionSource = (typeof ACTION_SOURCES)[number];

/** Batch of actions submitted together */
export interface ActionBatch {
  workbookId: string;
  revisionId: string;
  actions: Action[];
  source: ActionSource;
  metadata?: Record<string, unknown>;
}

/** Result returned after applying an action batch */
export interface ActionResult {
  revisionId: string;
  version: number;
  changedCells: Record<string, Record<string, CellValue>>;
  warnings: string[];
}
