import { Injectable } from '@nestjs/common';
import type { Sheet, CellValue, ColumnType } from '@excelflow/shared';
import { colIndexToLetter } from '@excelflow/shared';
import { ColumnDetectorService } from '../summary/column-detector.service';
import { DataNormalizerService } from '../summary/data-normalizer.service';

interface ColumnData {
  header: string;
  type: ColumnType;
  values: CellValue[];
  colIndex: number;
}

interface CrossTabTable {
  title: string;
  primaryHeader: string;
  groupHeader: string;
  primaryValues: string[];
  rows: Array<{ label: string; counts: Record<string, number>; total: number }>;
  grandTotal: Record<string, number>;
  grandTotalSum: number;
}

@Injectable()
export class CrossTabBuilderService {
  constructor(
    private readonly detector: ColumnDetectorService,
    private readonly normalizer: DataNormalizerService,
  ) {}

  /**
   * Computes cross-tabulation data from raw sheet data.
   * Returns a formatted string ready to embed in the AI prompt.
   */
  buildCrossTabString(sheet: Sheet): string {
    if (Object.keys(sheet.cells).length === 0 || sheet.usedRange.endRow < 1) {
      return 'No data available for cross-tabulation.';
    }

    const columns = this.extractColumns(sheet);
    const categoryColumns = columns.filter((c) => c.type === 'category');

    if (categoryColumns.length === 0) {
      return 'No category columns found for cross-tabulation.';
    }

    if (categoryColumns.length === 1) {
      return this.buildSingleCategoryString(categoryColumns[0]!);
    }

    const primary = this.detectPrimaryCategory(categoryColumns);
    const tables = this.computeCrossTabs(primary, categoryColumns);
    return this.formatCrossTabTables(primary, tables);
  }

  private extractColumns(sheet: Sheet): ColumnData[] {
    const maxCol = sheet.usedRange.endCol + 1;
    const columns: ColumnData[] = [];

    for (let c = 0; c < maxCol; c++) {
      const letter = colIndexToLetter(c);
      const headerCell = sheet.cells[`${letter}1`];
      const header = headerCell?.computedValue?.toString()
        ?? headerCell?.value?.toString() ?? letter;

      const values: CellValue[] = [];
      for (let r = 2; r <= sheet.usedRange.endRow + 1; r++) {
        const cell = sheet.cells[`${letter}${r}`];
        values.push(cell?.computedValue ?? cell?.value ?? null);
      }

      const type = this.detector.detectType(values);
      columns.push({ header, type, values, colIndex: c });
    }

    return columns;
  }

  private detectPrimaryCategory(columns: ColumnData[]): ColumnData {
    let best = columns[0]!;
    let bestUnique = this.normalizer.computeNormalizedFrequency(best.values).length;

    for (const col of columns) {
      const uniqueCount = this.normalizer.computeNormalizedFrequency(col.values).length;
      if (uniqueCount < bestUnique && uniqueCount >= 2) {
        best = col;
        bestUnique = uniqueCount;
      }
    }
    return best;
  }

  private computeCrossTabs(
    primary: ColumnData,
    categoryColumns: ColumnData[],
  ): CrossTabTable[] {
    const primaryValues = this.getUniqueValues(primary.values);
    const primaryMap = this.normalizer.buildNormalizationMap(primary.values);
    const tables: CrossTabTable[] = [];

    for (const groupCol of categoryColumns) {
      if (groupCol.header === primary.header) continue;

      const groupValues = this.getUniqueValues(groupCol.values);
      const groupMap = this.normalizer.buildNormalizationMap(groupCol.values);
      const rows: CrossTabTable['rows'] = [];

      for (const groupVal of groupValues) {
        const groupKey = groupVal.toUpperCase();
        const counts: Record<string, number> = {};
        let total = 0;

        for (const pVal of primaryValues) {
          const pKey = pVal.toUpperCase();
          let count = 0;
          for (let i = 0; i < primary.values.length; i++) {
            const gk = this.normalizer.toGroupKey(groupCol.values[i] ?? null);
            const pk = this.normalizer.toGroupKey(primary.values[i] ?? null);
            if (gk === groupKey && pk === pKey) {
              count++;
            }
          }
          counts[pVal] = count;
          total += count;
        }

        rows.push({ label: groupVal, counts, total });
      }

      const grandTotal: Record<string, number> = {};
      let grandTotalSum = 0;
      for (const pVal of primaryValues) {
        const colSum = rows.reduce((s, r) => s + (r.counts[pVal] ?? 0), 0);
        grandTotal[pVal] = colSum;
        grandTotalSum += colSum;
      }

      tables.push({
        title: `${primary.header} by ${groupCol.header}`,
        primaryHeader: primary.header,
        groupHeader: groupCol.header,
        primaryValues,
        rows,
        grandTotal,
        grandTotalSum,
      });
    }

    return tables;
  }

  private getUniqueValues(values: CellValue[]): string[] {
    const map = this.normalizer.buildNormalizationMap(values);
    return [...map.keyToDisplay.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([, display]) => display);
  }

  private buildSingleCategoryString(col: ColumnData): string {
    const freqEntries = this.normalizer.computeNormalizedFrequency(col.values);

    const lines = freqEntries.map(({ value, count }) => `  ${value}: ${count}`);
    const total = freqEntries.reduce((s, e) => s + e.count, 0);
    return `Distribution of "${col.header}":\n${lines.join('\n')}\n  Total: ${total}`;
  }

  private formatCrossTabTables(
    primary: ColumnData,
    tables: CrossTabTable[],
  ): string {
    const sections: string[] = [];

    // Primary distribution (normalized)
    const primaryFreq = this.normalizer.computeNormalizedFrequency(primary.values);

    sections.push(`=== PRIMARY CATEGORY: "${primary.header}" ===`);
    for (const { value, count } of primaryFreq) {
      sections.push(`  ${value}: ${count}`);
    }
    const totalRows = primaryFreq.reduce((s, e) => s + e.count, 0);
    sections.push(`  Total: ${totalRows}`);
    sections.push('');

    // Cross-tab tables
    for (const table of tables) {
      sections.push(`=== TABLE: "${table.title}" ===`);
      const header = [table.groupHeader, ...table.primaryValues, 'Total'];
      sections.push(header.join(' | '));
      sections.push('-'.repeat(header.join(' | ').length));

      for (const row of table.rows) {
        const vals = table.primaryValues.map((pv) => String(row.counts[pv] ?? 0));
        sections.push([row.label, ...vals, String(row.total)].join(' | '));
      }

      const grandVals = table.primaryValues.map((pv) => String(table.grandTotal[pv] ?? 0));
      sections.push(['Grand Total', ...grandVals, String(table.grandTotalSum)].join(' | '));
      sections.push('');
    }

    return sections.join('\n');
  }
}
