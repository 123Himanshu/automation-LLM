import { Injectable, Logger } from '@nestjs/common';
import type { Sheet, CellValue, Action } from '@excelflow/shared';
import { colIndexToLetter, buildCellRef } from '@excelflow/shared';
import { DataNormalizerService } from './data-normalizer.service';

type AggFn = 'count' | 'sum' | 'average' | 'min' | 'max';

interface PivotOptions {
  rowField: string;
  columnField: string;
  valueField: string;
  aggregation: AggFn;
}

interface PivotResult {
  sheetName: string;
  data: CellValue[][];
}

/**
 * Builds deterministic pivot tables from sheet data.
 * Separated from SummaryService to keep files under 500 lines.
 */
@Injectable()
export class PivotBuilderService {
  private readonly logger = new Logger(PivotBuilderService.name);

  constructor(private readonly normalizer: DataNormalizerService) {}

  buildPivot(sheet: Sheet, options: PivotOptions): PivotResult {
    const { headers, rows } = this.extractTableData(sheet);

    const rowIdx = headers.indexOf(options.rowField);
    const colIdx = headers.indexOf(options.columnField);
    const valIdx = headers.indexOf(options.valueField);

    if (rowIdx === -1 || colIdx === -1 || valIdx === -1) {
      this.logger.warn(
        `Pivot field not found. row="${options.rowField}" col="${options.columnField}" val="${options.valueField}". ` +
        `Available: ${headers.join(', ')}`,
      );
      return { sheetName: 'Pivot', data: [['Error: One or more pivot fields not found in headers']] };
    }

    // Collect unique row keys and column keys (normalized, sorted)
    const rowMap = this.normalizer.buildNormalizationMap(rows.map((r) => r[rowIdx] ?? null));
    const colMap = this.normalizer.buildNormalizationMap(rows.map((r) => r[colIdx] ?? null));
    const rowKeys = [...rowMap.keyToDisplay.values()].sort();
    const colKeys = [...colMap.keyToDisplay.values()].sort();

    // Build aggregation buckets: rowKey → colKey → values[]
    const buckets = new Map<string, Map<string, number[]>>();
    for (const rk of rowKeys) {
      buckets.set(rk, new Map(colKeys.map((ck) => [ck, []])));
    }

    for (const row of rows) {
      const rkNorm = this.normalizer.normalizeValue(row[rowIdx] ?? null);
      const ckNorm = this.normalizer.normalizeValue(row[colIdx] ?? null);
      if (rkNorm === null || ckNorm === null) continue;
      const rkDisplay = rowMap.keyToDisplay.get(rkNorm.toUpperCase()) ?? rkNorm;
      const ckDisplay = colMap.keyToDisplay.get(ckNorm.toUpperCase()) ?? ckNorm;
      const raw = row[valIdx];
      const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
      const bucket = buckets.get(rkDisplay)?.get(ckDisplay);
      if (bucket) {
        bucket.push(isNaN(num) ? (options.aggregation === 'count' ? 1 : 0) : num);
      }
    }

    // Build output grid
    const data: CellValue[][] = [];

    // Header row: rowField label + each column key + Grand Total
    data.push([
      `${options.rowField} \\ ${options.columnField}`,
      ...colKeys,
      'Grand Total',
    ]);

    // Data rows
    for (const rk of rowKeys) {
      const rowBuckets = buckets.get(rk)!;
      const rowValues: CellValue[] = [rk];
      const allVals: number[] = [];

      for (const ck of colKeys) {
        const vals = rowBuckets.get(ck) ?? [];
        const agg = this.aggregate(vals, options.aggregation);
        rowValues.push(agg);
        allVals.push(...vals);
      }

      rowValues.push(this.aggregate(allVals, options.aggregation));
      data.push(rowValues);
    }

    // Grand Total row
    const totalRow: CellValue[] = ['Grand Total'];
    for (const ck of colKeys) {
      const colVals: number[] = [];
      for (const rk of rowKeys) {
        colVals.push(...(buckets.get(rk)?.get(ck) ?? []));
      }
      totalRow.push(this.aggregate(colVals, options.aggregation));
    }
    // Grand total of everything
    const allValues: number[] = [];
    for (const row of rows) {
      const raw = row[valIdx];
      const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
      if (!isNaN(num)) allValues.push(num);
      else if (options.aggregation === 'count') allValues.push(1);
    }
    totalRow.push(this.aggregate(allValues, options.aggregation));
    data.push(totalRow);

    return { sheetName: 'Pivot', data };
  }

  /** Convert pivot data grid into SET_CELL actions for a target sheet */
  dataToActions(data: CellValue[][], sheetId: string): Action[] {
    const actions: Action[] = [];
    for (let r = 0; r < data.length; r++) {
      const row = data[r]!;
      for (let c = 0; c < row.length; c++) {
        const value = row[c];
        if (value === null || value === undefined) continue;
        actions.push({
          type: 'SET_CELL',
          sheetId,
          cellRef: buildCellRef(c, r),
          value,
        });
      }
    }
    return actions;
  }

  /** Generate FORMAT_CELLS actions for pivot table styling */
  formatActions(data: CellValue[][], sheetId: string): Action[] {
    if (data.length === 0) return [];
    const lastCol = Math.max(...data.map((r) => r.length)) - 1;
    const lastRow = data.length - 1;

    const actions: Action[] = [];

    // Bold header row
    actions.push({
      type: 'FORMAT_CELLS',
      sheetId,
      range: { startRow: 0, endRow: 0, startCol: 0, endCol: lastCol },
      format: { bold: true, bgColor: '#4472C4', fontColor: '#FFFFFF', alignment: 'center' },
    });

    // Bold first column (row labels)
    actions.push({
      type: 'FORMAT_CELLS',
      sheetId,
      range: { startRow: 1, endRow: lastRow, startCol: 0, endCol: 0 },
      format: { bold: true },
    });

    // Bold Grand Total row
    if (lastRow > 0) {
      actions.push({
        type: 'FORMAT_CELLS',
        sheetId,
        range: { startRow: lastRow, endRow: lastRow, startCol: 0, endCol: lastCol },
        format: { bold: true, bgColor: '#D9E2F3' },
      });
    }

    // Bold Grand Total column
    actions.push({
      type: 'FORMAT_CELLS',
      sheetId,
      range: { startRow: 1, endRow: lastRow, startCol: lastCol, endCol: lastCol },
      format: { bold: true },
    });

    // Right-align numeric cells
    if (lastCol > 0) {
      actions.push({
        type: 'FORMAT_CELLS',
        sheetId,
        range: { startRow: 1, endRow: lastRow - 1, startCol: 1, endCol: lastCol - 1 },
        format: { alignment: 'right' },
      });
    }

    return actions;
  }

  private aggregate(values: number[], fn: AggFn): number {
    if (values.length === 0) return 0;
    switch (fn) {
      case 'count':
        return values.length;
      case 'sum':
        return values.reduce((a, b) => a + b, 0);
      case 'average':
        return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
    }
  }

  private extractTableData(sheet: Sheet): { headers: string[]; rows: CellValue[][] } {
    const maxCol = sheet.usedRange.endCol;
    const maxRow = sheet.usedRange.endRow;

    const headers: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      const letter = colIndexToLetter(c);
      const cell = sheet.cells[`${letter}1`];
      headers.push(cell?.computedValue?.toString() ?? cell?.value?.toString() ?? `Col ${letter}`);
    }

    const rows: CellValue[][] = [];
    for (let r = 1; r <= maxRow; r++) {
      const row: CellValue[] = [];
      for (let c = 0; c <= maxCol; c++) {
        const letter = colIndexToLetter(c);
        const cell = sheet.cells[`${letter}${r + 1}`];
        row.push(cell?.computedValue ?? cell?.value ?? null);
      }
      rows.push(row);
    }

    return { headers, rows };
  }
}
