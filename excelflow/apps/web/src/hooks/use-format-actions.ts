'use client';

import { useCallback } from 'react';
import { useWorkbookStore } from '@/stores/workbook-store';
import { useUIStore } from '@/stores/ui-store';
import { toast } from '@/hooks/use-toast';
import type { Action, CellRange, Alignment } from '@excelflow/shared';
import { parseCellRef, buildCellRef } from '@excelflow/shared';

/** Parse a single cell ref "B3" or range "B3:D10" into a CellRange */
function parseRange(rangeStr: string): CellRange {
  const parts = rangeStr.split(':');
  if (parts.length === 2 && parts[0] && parts[1]) {
    const start = parseCellRef(parts[0]);
    const end = parseCellRef(parts[1]);
    return { startCol: start.col, startRow: start.row, endCol: end.col, endRow: end.row };
  }
  const single = parseCellRef(rangeStr);
  return { startCol: single.col, startRow: single.row, endCol: single.col, endRow: single.row };
}

/** Read the format of the top-left cell in the current selection */
function getSelectedCellFormat(): { bold?: boolean; italic?: boolean } {
  const { sheets, activeSheetId } = useWorkbookStore.getState();
  const { selectedRange } = useUIStore.getState();
  if (!activeSheetId || !selectedRange) return {};
  const sheet = sheets.find((s) => s.id === activeSheetId);
  if (!sheet) return {};
  const ref = selectedRange.split(':')[0] ?? selectedRange;
  const cell = sheet.cells[ref];
  return { bold: cell?.format?.bold, italic: cell?.format?.italic };
}

export function useFormatActions(): {
  toggleBold: () => void;
  toggleItalic: () => void;
  setAlignment: (align: Alignment) => void;
  setFontSize: (size: number) => void;
  setFontColor: (color: string) => void;
  setBgColor: (color: string) => void;
  setNumberFormat: (fmt: string) => void;
  mergeCells: () => void;
  unmergeCells: () => void;
  insertRows: (count?: number) => void;
  deleteRows: (count?: number) => void;
  insertCols: (count?: number) => void;
  deleteCols: (count?: number) => void;
  sortAsc: () => void;
  sortDesc: () => void;
} {
  const getContext = useCallback((): { sheetId: string; range: CellRange } | null => {
    const { activeSheetId } = useWorkbookStore.getState();
    const { selectedRange } = useUIStore.getState();
    if (!activeSheetId || !selectedRange) {
      toast.info('Select a cell or range first');
      return null;
    }
    return { sheetId: activeSheetId, range: parseRange(selectedRange) };
  }, []);

  const dispatch = useCallback((actions: Action[]): void => {
    useWorkbookStore.getState().applyActions(actions, 'manual');
  }, []);

  const toggleBold = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    const current = getSelectedCellFormat();
    dispatch([{ type: 'FORMAT_CELLS', sheetId: ctx.sheetId, range: ctx.range, format: { bold: !current.bold } }]);
  }, [getContext, dispatch]);

  const toggleItalic = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    const current = getSelectedCellFormat();
    dispatch([{ type: 'FORMAT_CELLS', sheetId: ctx.sheetId, range: ctx.range, format: { italic: !current.italic } }]);
  }, [getContext, dispatch]);

  const setAlignment = useCallback((align: Alignment) => {
    const ctx = getContext();
    if (!ctx) return;
    dispatch([{ type: 'FORMAT_CELLS', sheetId: ctx.sheetId, range: ctx.range, format: { alignment: align } }]);
  }, [getContext, dispatch]);

  const setFontSize = useCallback((size: number) => {
    const ctx = getContext();
    if (!ctx) return;
    dispatch([{ type: 'FORMAT_CELLS', sheetId: ctx.sheetId, range: ctx.range, format: { fontSize: size } }]);
  }, [getContext, dispatch]);

  const setFontColor = useCallback((color: string) => {
    const ctx = getContext();
    if (!ctx) return;
    dispatch([{ type: 'FORMAT_CELLS', sheetId: ctx.sheetId, range: ctx.range, format: { fontColor: color } }]);
  }, [getContext, dispatch]);

  const setBgColor = useCallback((color: string) => {
    const ctx = getContext();
    if (!ctx) return;
    dispatch([{ type: 'FORMAT_CELLS', sheetId: ctx.sheetId, range: ctx.range, format: { bgColor: color } }]);
  }, [getContext, dispatch]);

  const setNumberFormat = useCallback((fmt: string) => {
    const ctx = getContext();
    if (!ctx) return;
    dispatch([{ type: 'FORMAT_CELLS', sheetId: ctx.sheetId, range: ctx.range, format: { numberFormat: fmt } }]);
  }, [getContext, dispatch]);

  const mergeCells = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.range.startRow === ctx.range.endRow && ctx.range.startCol === ctx.range.endCol) {
      toast.info('Select multiple cells to merge');
      return;
    }
    dispatch([{ type: 'MERGE_CELLS', sheetId: ctx.sheetId, range: ctx.range }]);
  }, [getContext, dispatch]);

  const unmergeCells = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    dispatch([{ type: 'UNMERGE_CELLS', sheetId: ctx.sheetId, range: ctx.range }]);
  }, [getContext, dispatch]);

  const insertRows = useCallback((count = 1) => {
    const ctx = getContext();
    if (!ctx) return;
    dispatch([{ type: 'INSERT_ROWS', sheetId: ctx.sheetId, startRow: ctx.range.startRow, count }]);
  }, [getContext, dispatch]);

  const deleteRows = useCallback((count = 1) => {
    const ctx = getContext();
    if (!ctx) return;
    dispatch([{ type: 'DELETE_ROWS', sheetId: ctx.sheetId, startRow: ctx.range.startRow, count }]);
  }, [getContext, dispatch]);

  const insertCols = useCallback((count = 1) => {
    const ctx = getContext();
    if (!ctx) return;
    dispatch([{ type: 'INSERT_COLS', sheetId: ctx.sheetId, startCol: ctx.range.startCol, count }]);
  }, [getContext, dispatch]);

  const deleteCols = useCallback((count = 1) => {
    const ctx = getContext();
    if (!ctx) return;
    dispatch([{ type: 'DELETE_COLS', sheetId: ctx.sheetId, startCol: ctx.range.startCol, count }]);
  }, [getContext, dispatch]);

  const sortAsc = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    const { sheets, activeSheetId } = useWorkbookStore.getState();
    const sheet = sheets.find((s) => s.id === activeSheetId);
    if (!sheet) return;
    const range: CellRange = {
      startRow: 0, startCol: ctx.range.startCol,
      endRow: sheet.usedRange.endRow, endCol: ctx.range.startCol,
    };
    dispatch([{ type: 'SORT_RANGE', sheetId: ctx.sheetId, range, column: ctx.range.startCol, direction: 'asc' }]);
  }, [getContext, dispatch]);

  const sortDesc = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    const { sheets, activeSheetId } = useWorkbookStore.getState();
    const sheet = sheets.find((s) => s.id === activeSheetId);
    if (!sheet) return;
    const range: CellRange = {
      startRow: 0, startCol: ctx.range.startCol,
      endRow: sheet.usedRange.endRow, endCol: ctx.range.startCol,
    };
    dispatch([{ type: 'SORT_RANGE', sheetId: ctx.sheetId, range, column: ctx.range.startCol, direction: 'desc' }]);
  }, [getContext, dispatch]);

  return {
    toggleBold, toggleItalic, setAlignment, setFontSize,
    setFontColor, setBgColor, setNumberFormat, mergeCells, unmergeCells,
    insertRows, deleteRows, insertCols, deleteCols,
    sortAsc, sortDesc,
  };
}
