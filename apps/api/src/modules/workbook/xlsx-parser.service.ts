import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type {
  Sheet,
  Cell,
  CellType,
  CellValue,
  CellFormat,
  WorkbookMetrics,
  MergeRange,
} from '@excelflow/shared';
import { sanitizeSheetName, letterToColIndex, colIndexToLetter } from '@excelflow/shared';
import { createId } from '@paralleldrive/cuid2';

/** Volatile Excel functions that trigger recalc */
const VOLATILE_FUNCTIONS = ['NOW', 'TODAY', 'RAND', 'RANDBETWEEN', 'OFFSET', 'INDIRECT'];

interface ParseResult {
  sheets: Sheet[];
  metrics: WorkbookMetrics;
}

@Injectable()
export class XlsxParserService {
  private readonly logger = new Logger(XlsxParserService.name);

  /** Parse a buffer into the canonical workbook model */
  async parseBuffer(buffer: Buffer, ext: string): Promise<ParseResult> {
    if (ext === '.csv') {
      return this.parseCsvBuffer(buffer);
    }
    return this.parseXlsxBuffer(buffer);
  }

  /** Parse a CSV buffer into the canonical workbook model */
  private async parseCsvBuffer(buffer: Buffer): Promise<ParseResult> {
    const raw = buffer.toString('utf-8');
    const delimiter = this.detectDelimiter(raw);
    const rows = this.parseCsvContent(raw, delimiter);

    const cells: Record<string, Cell> = {};
    let maxRow = 0;
    let maxCol = 0;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        if (val === undefined || val === '') continue;
        const ref = `${colIndexToLetter(c)}${r + 1}`;
        const { value, type } = this.inferCsvCellType(val);
        cells[ref] = { value, type, computedValue: undefined, formula: undefined, format: undefined };
        maxRow = Math.max(maxRow, r);
        maxCol = Math.max(maxCol, c);
      }
    }

    const sheet: Sheet = {
      id: createId(),
      name: 'Sheet1',
      cells,
      merges: [],
      columnWidths: {},
      rowHeights: {},
      frozenRows: 0,
      frozenCols: 0,
      usedRange: { startRow: 0, startCol: 0, endRow: maxRow, endCol: maxCol },
    };

    const usedCells = Object.keys(cells).length;
    const metrics: WorkbookMetrics = {
      usedCells,
      formulaCount: 0,
      volatileCount: 0,
      sheetCount: 1,
      crossSheetDeps: 0,
      maxColumns: maxCol + 1,
      mergeCount: 0,
      styleDensity: 0,
    };

    this.logger.log(`Parsed CSV (delimiter='${delimiter === '\t' ? 'TAB' : delimiter}'): 1 sheet, ${usedCells} cells, ${rows.length} rows`);
    return { sheets: [sheet], metrics };
  }

  /** Auto-detect CSV delimiter by counting occurrences in the first few lines */
  private detectDelimiter(text: string): string {
    const sampleLines = text.split('\n').slice(0, 5).join('\n');
    const candidates = [',', ';', '\t', '|'] as const;
    let best = ',';
    let bestCount = 0;
    for (const d of candidates) {
      const count = sampleLines.split(d).length - 1;
      if (count > bestCount) {
        bestCount = count;
        best = d;
      }
    }
    return best;
  }

  /** Parse CSV text handling quoted fields, delimiters inside quotes, and newlines inside quotes */
  private parseCsvContent(text: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let current = '';
    let inQuotes = false;
    let row: string[] = [];

    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            current += '"';
            i++; // skip escaped quote
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          row.push(current.trim());
          current = '';
        } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
          row.push(current.trim());
          current = '';
          if (row.some((v) => v !== '')) rows.push(row);
          row = [];
          if (ch === '\r') i++; // skip \n after \r
        } else {
          current += ch;
        }
      }
    }
    // Last field/row
    row.push(current.trim());
    if (row.some((v) => v !== '')) rows.push(row);

    return rows;
  }

  /** Infer cell type from a CSV string value */
  private inferCsvCellType(val: string): { value: CellValue; type: CellType } {
    if (val === '') return { value: null, type: 'empty' };

    const lower = val.toLowerCase();
    if (lower === 'true') return { value: true, type: 'boolean' };
    if (lower === 'false') return { value: false, type: 'boolean' };

    const num = Number(val);
    if (val !== '' && !isNaN(num) && isFinite(num)) {
      return { value: num, type: 'number' };
    }

    if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return { value: d.toISOString(), type: 'date' };
    }

    return { value: val, type: 'string' };
  }

  private async parseXlsxBuffer(buffer: Buffer): Promise<ParseResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const sheets: Sheet[] = [];
    let totalUsedCells = 0;
    let totalFormulas = 0;
    let totalVolatile = 0;
    let totalMerges = 0;
    let maxColumns = 0;
    let crossSheetRefs = 0;

    for (const ws of workbook.worksheets) {
      const cells: Record<string, Cell> = {};
      const merges: MergeRange[] = [];
      const columnWidths: Record<number, number> = {};
      const rowHeights: Record<number, number> = {};
      let minRow = Infinity, minCol = Infinity;
      let maxRow = 0, maxCol = 0;

      if (ws.model.merges) {
        for (const mergeRef of ws.model.merges) {
          const parsed = this.parseMergeRef(mergeRef);
          if (parsed) { merges.push(parsed); totalMerges++; }
        }
      }

      ws.columns.forEach((col, idx) => {
        if (col.width) columnWidths[idx] = Math.round(col.width * 7.5);
      });

      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (row.height) rowHeights[rowNumber - 1] = row.height;
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const ref = cell.address;
          const parsed = this.parseCell(cell);
          if (parsed) {
            cells[ref] = parsed;
            totalUsedCells++;
            const r = rowNumber - 1;
            const c = colNumber - 1;
            minRow = Math.min(minRow, r);
            minCol = Math.min(minCol, c);
            maxRow = Math.max(maxRow, r);
            maxCol = Math.max(maxCol, c);
            if (parsed.formula) {
              totalFormulas++;
              if (this.isVolatile(parsed.formula)) totalVolatile++;
              if (this.hasCrossSheetRef(parsed.formula)) crossSheetRefs++;
            }
          }
        });
      });

      maxColumns = Math.max(maxColumns, maxCol + 1);

      sheets.push({
        id: createId(),
        name: sanitizeSheetName(ws.name),
        cells, merges, columnWidths, rowHeights,
        frozenRows: (ws.views?.[0] as Record<string, unknown>)?.['ySplit'] as number ?? 0,
        frozenCols: (ws.views?.[0] as Record<string, unknown>)?.['xSplit'] as number ?? 0,
        usedRange: {
          startRow: minRow === Infinity ? 0 : minRow,
          startCol: minCol === Infinity ? 0 : minCol,
          endRow: maxRow, endCol: maxCol,
        },
      });
    }

    if (sheets.length === 0) {
      sheets.push(this.createEmptySheet('Sheet1'));
    }

    const metrics: WorkbookMetrics = {
      usedCells: totalUsedCells,
      formulaCount: totalFormulas,
      volatileCount: totalVolatile,
      sheetCount: sheets.length,
      crossSheetDeps: crossSheetRefs,
      maxColumns,
      mergeCount: totalMerges,
      styleDensity: 0,
    };

    this.logger.log(
      `Parsed ${sheets.length} sheets, ${totalUsedCells} cells, ${totalFormulas} formulas`,
    );
    return { sheets, metrics };
  }

  private parseCell(cell: ExcelJS.Cell): Cell | null {
    const formula = cell.formula ? `=${cell.formula}` : undefined;
    const rawValue = cell.value;
    const { value, type } = this.extractValue(rawValue, !!formula);
    const format = this.extractFormat(cell.style);

    return {
      value: formula ? null : value,
      formula,
      computedValue: formula ? value : undefined,
      format: Object.keys(format).length > 0 ? format : undefined,
      type: formula ? 'formula' : type,
    };
  }

  private extractValue(
    raw: ExcelJS.CellValue,
    hasFormula: boolean,
  ): { value: CellValue; type: CellType } {
    if (raw === null || raw === undefined) return { value: null, type: 'empty' };
    if (typeof raw === 'number') return { value: raw, type: 'number' };
    if (typeof raw === 'boolean') return { value: raw, type: 'boolean' };
    if (typeof raw === 'string') return { value: this.normalizeString(raw), type: 'string' };
    if (raw instanceof Date) return { value: raw.toISOString(), type: 'date' };

    if (typeof raw === 'object' && raw !== null && 'result' in raw) {
      const result = (raw as { result: unknown }).result;
      if (typeof result === 'number') return { value: result, type: hasFormula ? 'formula' : 'number' };
      if (typeof result === 'string') return { value: this.normalizeString(result), type: hasFormula ? 'formula' : 'string' };
      if (typeof result === 'boolean') return { value: result, type: hasFormula ? 'formula' : 'boolean' };
    }

    if (typeof raw === 'object' && raw !== null && 'richText' in raw) {
      const rt = raw as { richText: Array<{ text: string }> };
      const text = rt.richText.map((r) => r.text).join('');
      return { value: this.normalizeString(text), type: 'string' };
    }

    return { value: String(raw), type: 'string' };
  }

  private extractFormat(style: Partial<ExcelJS.Style>): Partial<CellFormat> {
    const fmt: Partial<CellFormat> = {};
    if (style.font?.bold) fmt.bold = true;
    if (style.font?.italic) fmt.italic = true;
    if (style.font?.size) fmt.fontSize = style.font.size;
    if (style.alignment?.horizontal) {
      const h = style.alignment.horizontal;
      if (h === 'left' || h === 'center' || h === 'right') fmt.alignment = h;
    }
    if (style.numFmt) fmt.numberFormat = style.numFmt;
    return fmt;
  }

  private isVolatile(formula: string): boolean {
    const upper = formula.toUpperCase();
    return VOLATILE_FUNCTIONS.some((fn) => upper.includes(fn + '('));
  }

  private hasCrossSheetRef(formula: string): boolean {
    return formula.includes('!');
  }

  private parseMergeRef(ref: string): MergeRange | null {
    const match = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) return null;
    return {
      startCol: letterToColIndex(match[1]!),
      startRow: parseInt(match[2]!, 10) - 1,
      endCol: letterToColIndex(match[3]!),
      endRow: parseInt(match[4]!, 10) - 1,
    };
  }

  private normalizeString(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  createEmptySheet(name: string): Sheet {
    return {
      id: createId(),
      name: sanitizeSheetName(name),
      cells: {},
      merges: [],
      columnWidths: {},
      rowHeights: {},
      frozenRows: 0,
      frozenCols: 0,
      usedRange: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
    };
  }
}
