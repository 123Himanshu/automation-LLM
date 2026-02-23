import { Injectable, Logger } from '@nestjs/common';
import { RecalcService } from './recalc.service';
import type { Sheet } from '@excelflow/shared';
import { parseCellRef, buildCellRef, SHEET_LIMITS } from '@excelflow/shared';

/**
 * Handles structural actions: row/col insert/delete, sort, merge/unmerge.
 * Split from ActionService to keep files under 500 lines.
 */
@Injectable()
export class StructuralActionService {
  private readonly logger = new Logger(StructuralActionService.name);

  constructor(private readonly recalc: RecalcService) {}

  applyInsertRows(
    action: { sheetId: string; startRow: number; count: number },
    sheets: Sheet[],
    workbookId: string,
  ): void {
    const sheet = sheets.find((s) => s.id === action.sheetId);
    if (!sheet) return;

    const sheetIdx = sheets.indexOf(sheet);
    const { startRow, count } = action;

    // Shift existing cells down
    const newCells: Record<string, typeof sheet.cells[string]> = {};
    for (const [ref, cell] of Object.entries(sheet.cells)) {
      const { col, row } = parseCellRef(ref);
      if (row >= startRow) {
        newCells[buildCellRef(col, row + count)] = cell;
      } else {
        newCells[ref] = cell;
      }
    }
    sheet.cells = newCells;

    if (sheet.usedRange.endRow >= startRow) {
      sheet.usedRange.endRow = Math.min(
        sheet.usedRange.endRow + count,
        SHEET_LIMITS.MAX_ROWS - 1,
      );
    }

    this.recalc.rebuildSheet(workbookId, sheetIdx, sheet);
    this.logger.log(`Inserted ${count} rows at row ${startRow} in sheet ${sheet.name}`);
  }

  applyDeleteRows(
    action: { sheetId: string; startRow: number; count: number },
    sheets: Sheet[],
    workbookId: string,
  ): void {
    const sheet = sheets.find((s) => s.id === action.sheetId);
    if (!sheet) return;

    const sheetIdx = sheets.indexOf(sheet);
    const { startRow, count } = action;
    const endRow = startRow + count - 1;

    const newCells: Record<string, typeof sheet.cells[string]> = {};
    for (const [ref, cell] of Object.entries(sheet.cells)) {
      const { col, row } = parseCellRef(ref);
      if (row >= startRow && row <= endRow) {
        continue; // Delete these rows
      } else if (row > endRow) {
        newCells[buildCellRef(col, row - count)] = cell;
      } else {
        newCells[ref] = cell;
      }
    }
    sheet.cells = newCells;
    sheet.usedRange.endRow = Math.max(0, sheet.usedRange.endRow - count);

    this.recalc.rebuildSheet(workbookId, sheetIdx, sheet);
    this.logger.log(`Deleted ${count} rows at row ${startRow} in sheet ${sheet.name}`);
  }

  applyInsertCols(
    action: { sheetId: string; startCol: number; count: number },
    sheets: Sheet[],
    workbookId: string,
  ): void {
    const sheet = sheets.find((s) => s.id === action.sheetId);
    if (!sheet) return;

    const sheetIdx = sheets.indexOf(sheet);
    const { startCol, count } = action;

    const newCells: Record<string, typeof sheet.cells[string]> = {};
    for (const [ref, cell] of Object.entries(sheet.cells)) {
      const { col, row } = parseCellRef(ref);
      if (col >= startCol) {
        newCells[buildCellRef(col + count, row)] = cell;
      } else {
        newCells[ref] = cell;
      }
    }
    sheet.cells = newCells;

    if (sheet.usedRange.endCol >= startCol) {
      sheet.usedRange.endCol = Math.min(
        sheet.usedRange.endCol + count,
        SHEET_LIMITS.MAX_COLS - 1,
      );
    }

    this.recalc.rebuildSheet(workbookId, sheetIdx, sheet);
    this.logger.log(`Inserted ${count} cols at col ${startCol} in sheet ${sheet.name}`);
  }

  applyDeleteCols(
    action: { sheetId: string; startCol: number; count: number },
    sheets: Sheet[],
    workbookId: string,
  ): void {
    const sheet = sheets.find((s) => s.id === action.sheetId);
    if (!sheet) return;

    const sheetIdx = sheets.indexOf(sheet);
    const { startCol, count } = action;
    const endCol = startCol + count - 1;

    const newCells: Record<string, typeof sheet.cells[string]> = {};
    for (const [ref, cell] of Object.entries(sheet.cells)) {
      const { col, row } = parseCellRef(ref);
      if (col >= startCol && col <= endCol) {
        continue; // Delete these columns
      } else if (col > endCol) {
        newCells[buildCellRef(col - count, row)] = cell;
      } else {
        newCells[ref] = cell;
      }
    }
    sheet.cells = newCells;
    sheet.usedRange.endCol = Math.max(0, sheet.usedRange.endCol - count);

    this.recalc.rebuildSheet(workbookId, sheetIdx, sheet);
    this.logger.log(`Deleted ${count} cols at col ${startCol} in sheet ${sheet.name}`);
  }

  applySortRange(
    action: {
      sheetId: string;
      range: { startRow: number; endRow: number; startCol: number; endCol: number };
      column: number;
      direction: 'asc' | 'desc';
    },
    sheets: Sheet[],
    workbookId: string,
  ): void {
    const sheet = sheets.find((s) => s.id === action.sheetId);
    if (!sheet) return;

    const sheetIdx = sheets.indexOf(sheet);
    const { startRow, endRow, startCol, endCol } = action.range;
    const sortCol = action.column;

    // Extract rows as arrays
    const rows: { cells: (typeof sheet.cells[string] | null)[] }[] = [];
    for (let r = startRow; r <= endRow; r++) {
      const rowCells: (typeof sheet.cells[string] | null)[] = [];
      for (let c = startCol; c <= endCol; c++) {
        rowCells.push(sheet.cells[buildCellRef(c, r)] ?? null);
      }
      rows.push({ cells: rowCells });
    }

    // Sort by the specified column value
    const colOffset = sortCol - startCol;
    rows.sort((a, b) => {
      const aCell = a.cells[colOffset];
      const bCell = b.cells[colOffset];
      const aVal = aCell?.computedValue ?? aCell?.value ?? null;
      const bVal = bCell?.computedValue ?? bCell?.value ?? null;

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return action.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return action.direction === 'asc' ? cmp : -cmp;
    });

    // Write sorted rows back
    for (let i = 0; i < rows.length; i++) {
      const targetRow = startRow + i;
      const rowData = rows[i]!;
      for (let c = startCol; c <= endCol; c++) {
        const ref = buildCellRef(c, targetRow);
        const cell = rowData.cells[c - startCol];
        if (cell) {
          sheet.cells[ref] = cell;
        } else {
          delete sheet.cells[ref];
        }
      }
    }

    this.recalc.rebuildSheet(workbookId, sheetIdx, sheet);
    this.logger.log(
      `Sorted range ${buildCellRef(startCol, startRow)}:${buildCellRef(endCol, endRow)} ` +
      `by col ${sortCol} ${action.direction} in sheet ${sheet.name}`,
    );
  }

  applyMergeCells(
    action: { sheetId: string; range: { startRow: number; endRow: number; startCol: number; endCol: number } },
    sheets: Sheet[],
  ): void {
    const sheet = sheets.find((s) => s.id === action.sheetId);
    if (!sheet) return;

    const exists = sheet.merges.some(
      (m) =>
        m.startRow === action.range.startRow &&
        m.startCol === action.range.startCol &&
        m.endRow === action.range.endRow &&
        m.endCol === action.range.endCol,
    );
    if (!exists) {
      sheet.merges.push({ ...action.range });
    }

    // Keep top-left cell value, clear others
    for (let r = action.range.startRow; r <= action.range.endRow; r++) {
      for (let c = action.range.startCol; c <= action.range.endCol; c++) {
        if (r === action.range.startRow && c === action.range.startCol) continue;
        delete sheet.cells[buildCellRef(c, r)];
      }
    }
    this.logger.log(`Merged cells ${JSON.stringify(action.range)} in sheet ${sheet.name}`);
  }

  applyUnmergeCells(
    action: { sheetId: string; range: { startRow: number; endRow: number; startCol: number; endCol: number } },
    sheets: Sheet[],
  ): void {
    const sheet = sheets.find((s) => s.id === action.sheetId);
    if (!sheet) return;

    sheet.merges = sheet.merges.filter(
      (m) =>
        m.startRow !== action.range.startRow ||
        m.startCol !== action.range.startCol ||
        m.endRow !== action.range.endRow ||
        m.endCol !== action.range.endCol,
    );
    this.logger.log(`Unmerged cells ${JSON.stringify(action.range)} in sheet ${sheet.name}`);
  }
}
