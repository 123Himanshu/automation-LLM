import { Injectable } from '@nestjs/common';
import { ColumnDetectorService } from '../summary/column-detector.service';
import type {
  Sheet, AIContext, WorkbookClassification, CellValue,
  SheetBlueprint, ColumnMapping,
} from '@excelflow/shared';
import { colIndexToLetter, buildCellRef, PERFORMANCE } from '@excelflow/shared';
import { DataNormalizerService } from '../summary/data-normalizer.service';

@Injectable()
export class ContextBuilderService {
  constructor(
    private readonly detector: ColumnDetectorService,
    private readonly normalizer: DataNormalizerService,
  ) {}

  buildContext(
    workbookId: string,
    sheets: Sheet[],
    activeSheet: string,
    classification: WorkbookClassification,
    selectedRange?: string,
  ): AIContext {
    const allSheetNames = sheets.map((s) => s.name);
    return {
      workbookId,
      sheets: sheets.map((sheet) =>
        this.buildSheetContext(sheet, classification, allSheetNames),
      ),
      activeSheet,
      selectedRange,
      classification,
      existingSheetNames: allSheetNames,
    };
  }

  private buildSheetContext(
    sheet: Sheet,
    classification: WorkbookClassification,
    allSheetNames: string[],
  ): AIContext['sheets'][number] {
    const { headers, columnValues, maxCol } = this.extractColumnsForAI(sheet);
    const rowCount = sheet.usedRange.endRow - sheet.usedRange.startRow;
    const colCount = maxCol || 1;

    // Smart row limit: send ALL data if it fits within the cell budget
    // 594 rows × 5 cols = 2,970 cells → send everything
    // 5,000 rows × 50 cols = 250k cells → sample down
    const totalCells = rowCount * colCount;
    let maxSampleRows: number;

    if (classification === 'heavy') {
      // Heavy workbooks: still limit, but give more than before
      const heavyBudget = Math.min(PERFORMANCE.AI_MAX_CELL_BUDGET / 2, PERFORMANCE.AI_MAX_ROW_CAP);
      maxSampleRows = Math.min(rowCount, Math.floor(heavyBudget / colCount));
    } else if (totalCells <= PERFORMANCE.AI_MAX_CELL_BUDGET) {
      // Fits in budget → send ALL rows
      maxSampleRows = Math.min(rowCount, PERFORMANCE.AI_MAX_ROW_CAP);
    } else {
      // Over budget → calculate how many rows fit
      maxSampleRows = Math.max(
        PERFORMANCE.AI_SAMPLE_ROWS,
        Math.min(Math.floor(PERFORMANCE.AI_MAX_CELL_BUDGET / colCount), PERFORMANCE.AI_MAX_ROW_CAP),
      );
    }

    const columnTypes = headers.map((_, i) =>
      this.detector.detectType(columnValues[i] ?? []),
    );

    const stats = headers.map((header, i) =>
      this.detector.computeStats(header, columnValues[i] ?? [], columnTypes[i]!),
    );

    const sampleRows = this.getSampleRows(sheet, maxCol, maxSampleRows);

    // Build the precise blueprint for formula generation
    const blueprint = this.buildBlueprint(
      sheet, headers, columnValues, columnTypes, allSheetNames,
    );

    return {
      id: sheet.id,
      name: sheet.name,
      usedRange: this.formatRange(sheet),
      headers,
      columnTypes,
      stats,
      sampleRows,
      rowCount,
      blueprint,
    };
  }

  /**
   * Build a SheetBlueprint with precise structural info for AI formula generation.
   * Fixes Problems 1, 2, 3, 5, 6, 7, 15.
   */
  private buildBlueprint(
    sheet: Sheet,
    headers: string[],
    columnValues: CellValue[][],
    columnTypes: string[],
    allSheetNames: string[],
  ): SheetBlueprint {
    const maxCol = sheet.usedRange.endCol + 1;
    const dataStartRow = 2; // Row after header
    const dataEndRow = sheet.usedRange.endRow + 1;
    const totalDataRows = dataEndRow - dataStartRow + 1;

    const columnMap: ColumnMapping[] = [];
    for (let c = 0; c < maxCol; c++) {
      const letter = colIndexToLetter(c);
      const type = columnTypes[c] as ColumnMapping['type'];
      const values = columnValues[c] ?? [];

      const mapping: ColumnMapping = {
        letter,
        header: headers[c] ?? letter,
        type,
      };

      // For category columns: extract ALL unique values (Fixes Problem 3)
      if (type === 'category') {
        mapping.uniqueValues = this.getUniqueValues(values);
      } else {
        // For non-category: provide sample values
        mapping.sampleValues = values.filter((v) => v !== null).slice(0, 3);
      }

      // Detect number format (Fixes Problem 15)
      mapping.numberFormat = this.detectNumberFormat(sheet, letter);

      columnMap.push(mapping);
    }

    // Detect merge ranges (Fixes Problem 6)
    const mergeRanges = (sheet.merges ?? []).map((m) => {
      const start = buildCellRef(m.startCol, m.startRow);
      const end = buildCellRef(m.endCol, m.endRow);
      return `${start}:${end}`;
    });

    return {
      sheetId: sheet.id,
      sheetName: sheet.name,
      escapedSheetName: this.escapeSheetName(sheet.name), // Fixes Problem 2
      dataStartRow,
      dataEndRow,
      totalDataRows,
      columnMap,
      mergeRanges,
      hasMerges: mergeRanges.length > 0,
      existingSheetNames: allSheetNames, // Fixes Problem 7
    };
  }

  /**
   * Escape a sheet name for use in cross-sheet formula references.
   * Sheet names with spaces, special chars, or starting with digits need single quotes.
   */
  private escapeSheetName(name: string): string {
    const needsQuotes = /[^A-Za-z0-9_]/.test(name) || /^\d/.test(name);
    return needsQuotes ? `'${name.replace(/'/g, "''")}'` : name;
  }

  /** Get ALL unique values from a column, normalized and sorted */
  private getUniqueValues(values: CellValue[]): string[] {
    const freq = this.normalizer.computeNormalizedFrequency(values);
    return freq.map((f) => f.value);
  }

  /** Detect number format from cell format metadata */
  private detectNumberFormat(sheet: Sheet, colLetter: string): string {
    // Sample a few data cells to detect format
    for (let r = 2; r <= Math.min(sheet.usedRange.endRow + 1, 10); r++) {
      const cell = sheet.cells[`${colLetter}${r}`];
      if (cell?.format?.numberFormat) {
        const fmt = cell.format.numberFormat.toLowerCase();
        if (fmt.includes('%')) return 'percentage';
        if (fmt.includes('$') || fmt.includes('₹') || fmt.includes('€')) return 'currency';
        if (fmt.includes('.')) return 'decimal';
      }
    }
    return 'general';
  }

  private extractColumnsForAI(sheet: Sheet): {
    headers: string[];
    columnValues: CellValue[][];
    maxCol: number;
  } {
    const entries = Object.entries(sheet.cells);
    if (entries.length === 0) {
      return { headers: [], columnValues: [], maxCol: 0 };
    }

    const maxCol = sheet.usedRange.endCol + 1;
    const headers: string[] = [];
    const columnValues: CellValue[][] = [];

    for (let c = 0; c < maxCol; c++) {
      const letter = colIndexToLetter(c);
      const headerCell = sheet.cells[`${letter}1`];
      headers.push(
        headerCell?.computedValue?.toString()
          ?? headerCell?.value?.toString()
          ?? letter,
      );

      const values: CellValue[] = [];
      for (let r = 2; r <= sheet.usedRange.endRow + 1; r++) {
        const cell = sheet.cells[`${letter}${r}`];
        values.push(cell?.computedValue ?? cell?.value ?? null);
      }
      columnValues.push(values);
    }

    return { headers, columnValues, maxCol };
  }

  private getSampleRows(
    sheet: Sheet,
    maxCol: number,
    maxRows: number,
  ): unknown[][] {
    const rows: unknown[][] = [];
    for (let r = 2; r <= Math.min(sheet.usedRange.endRow + 1, maxRows + 1); r++) {
      const row: unknown[] = [];
      for (let c = 0; c < maxCol; c++) {
        const cell = sheet.cells[`${colIndexToLetter(c)}${r}`];
        row.push(cell?.computedValue ?? cell?.value ?? null);
      }
      rows.push(row);
    }
    return rows;
  }

  private formatRange(sheet: Sheet): string {
    const start = `${colIndexToLetter(sheet.usedRange.startCol)}${sheet.usedRange.startRow + 1}`;
    const end = `${colIndexToLetter(sheet.usedRange.endCol)}${sheet.usedRange.endRow + 1}`;
    return `${start}:${end}`;
  }
}
