import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Sheet, CellFormat } from '@excelflow/shared';

@Injectable()
export class XlsxExportService {
  private readonly logger = new Logger(XlsxExportService.name);

  /** Export sheets to an XLSX buffer (no disk writes) */
  async exportToBuffer(sheets: Sheet[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    for (const sheet of sheets) {
      const ws = workbook.addWorksheet(sheet.name);

      // Set column widths
      for (const [colIdx, width] of Object.entries(sheet.columnWidths)) {
        const col = ws.getColumn(parseInt(colIdx, 10) + 1);
        col.width = width;
      }

      // Set frozen panes
      if (sheet.frozenRows > 0 || sheet.frozenCols > 0) {
        ws.views = [{ state: 'frozen', xSplit: sheet.frozenCols, ySplit: sheet.frozenRows }];
      }

      // Write cells
      for (const [ref, cell] of Object.entries(sheet.cells)) {
        const wsCell = ws.getCell(ref);

        if (cell.formula) {
          wsCell.value = {
            formula: cell.formula.slice(1),
            result: cell.computedValue ?? undefined,
          } as ExcelJS.CellFormulaValue;
        } else if (cell.value !== null) {
          wsCell.value = cell.value as ExcelJS.CellValue;
        }

        if (cell.format) {
          this.applyFormat(wsCell, cell.format);
        }
      }

      // Apply merges
      for (const merge of sheet.merges) {
        ws.mergeCells(
          merge.startRow + 1, merge.startCol + 1,
          merge.endRow + 1, merge.endCol + 1,
        );
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    this.logger.log(`XLSX exported to buffer (${sheets.length} sheets)`);
    return Buffer.from(buffer);
  }

  private applyFormat(wsCell: ExcelJS.Cell, format: Partial<CellFormat>): void {
    const bold = format.bold;
    const italic = format.italic;
    const fontSize = format.fontSize;
    const fontColor = format.fontColor;
    const bgColor = format.bgColor;
    const alignment = format.alignment;
    const numberFormat = format.numberFormat;

    if (bold || italic || fontSize || fontColor) {
      wsCell.font = {
        bold,
        italic,
        size: fontSize,
        color: fontColor ? { argb: fontColor.replace('#', 'FF') } : undefined,
      };
    }
    if (bgColor) {
      wsCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgColor.replace('#', 'FF') },
      };
    }
    if (alignment === 'left' || alignment === 'center' || alignment === 'right') {
      wsCell.alignment = { horizontal: alignment };
    }
    if (numberFormat && typeof numberFormat === 'string') {
      wsCell.numFmt = numberFormat;
    }
  }
}
