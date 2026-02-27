import {
  Injectable, BadRequestException, ConflictException, Logger, OnModuleInit,
} from '@nestjs/common';
import { ActionValidatorService } from './action-validator.service';
import { RecalcService } from './recalc.service';
import { StructuralActionService } from './structural-action.service';
import { WorkbookService } from '../workbook/workbook.service';
import { RevisionService } from '../revision/revision.service';
import type { ActionBatch, ActionResult, Action, Sheet, CellValue, MergeRange } from '@excelflow/shared';
import { parseCellRef, sanitizeSheetName, buildCellRef, SHEET_LIMITS } from '@excelflow/shared';
import { createId } from '@paralleldrive/cuid2';

@Injectable()
export class ActionService implements OnModuleInit {
  private readonly logger = new Logger(ActionService.name);

  constructor(
    private readonly validator: ActionValidatorService,
    private readonly recalc: RecalcService,
    private readonly structural: StructuralActionService,
    private readonly workbookService: WorkbookService,
    private readonly revisionService: RevisionService,
  ) {}

  /** Register HyperFormula cleanup callback so workbook deletion cleans up HF instances */
  onModuleInit(): void {
    WorkbookService.registerHfCleanup((id: string) => this.recalc.destroyInstance(id));
    this.logger.log('Registered HyperFormula cleanup callback with WorkbookService');
  }

  async applyBatch(batch: ActionBatch): Promise<ActionResult> {
    // Optimistic concurrency: only enforce for AI actions (single-user app)
    if (batch.source === 'ai' && batch.revisionId && batch.revisionId !== 'R0' && batch.revisionId !== 'latest') {
      try {
        const latest = await this.revisionService.getLatest(batch.workbookId);
        if (latest.id !== batch.revisionId) {
          throw new ConflictException({
            error: 'REVISION_CONFLICT',
            message: 'Workbook has been modified since your last load. Refresh and retry.',
            currentRevisionId: latest.id,
            yourRevisionId: batch.revisionId,
          });
        }
      } catch (err) {
        // NotFoundException means no revisions yet — that's fine for first edit
        if (err instanceof ConflictException) throw err;
      }
    }

    const sheets = await this.workbookService.getSheets(batch.workbookId);

    const validation = this.validator.validate(batch.actions, sheets);
    if (!validation.valid) {
      throw new BadRequestException({
        error: 'VALIDATION_ERROR',
        message: 'Action validation failed',
        details: validation.errors,
      });
    }

    this.recalc.getOrCreateInstance(batch.workbookId, sheets);
    this.recalc.suspendEvaluation(batch.workbookId);

    try {
      for (const action of batch.actions) {
        this.applyAction(action, sheets, batch.workbookId);
      }
    } finally {
      this.recalc.resumeEvaluation(batch.workbookId);
    }

    // Re-sync formula cells that may have failed during suspended evaluation
    this.recalc.resyncFormulas(batch.workbookId, sheets);

    const workbook = await this.workbookService.getById(batch.workbookId);
    const classification = workbook.classification as 'normal' | 'large' | 'heavy';
    const changedCells = this.recalc.recalculate(batch.workbookId, sheets, classification);

    this.workbookService.updateCachedSheets(batch.workbookId, sheets);
    const { id: revisionId, version } = await this.revisionService.createRevision(batch, sheets);

    this.logger.log(
      `Applied ${batch.actions.length} actions to workbook ${batch.workbookId}, rev v${version}`,
    );

    return { revisionId, version, changedCells, warnings: validation.warnings };
  }

  private applyAction(action: Action, sheets: Sheet[], workbookId: string): void {
    switch (action.type) {
      case 'SET_CELL':
        this.applySetCell(action, sheets, workbookId);
        break;
      case 'SET_RANGE':
        this.applySetRange(action, sheets, workbookId);
        break;
      case 'CREATE_SHEET':
        this.applyCreateSheet(action, sheets, workbookId);
        break;
      case 'DELETE_SHEET':
        this.applyDeleteSheet(action, sheets, workbookId);
        break;
      case 'RENAME_SHEET':
        this.applyRenameSheet(action, sheets);
        break;
      case 'FORMAT_CELLS':
        this.applyFormatCells(action, sheets);
        break;
      case 'INSERT_ROWS':
        this.structural.applyInsertRows(action, sheets, workbookId);
        break;
      case 'DELETE_ROWS':
        this.structural.applyDeleteRows(action, sheets, workbookId);
        break;
      case 'INSERT_COLS':
        this.structural.applyInsertCols(action, sheets, workbookId);
        break;
      case 'DELETE_COLS':
        this.structural.applyDeleteCols(action, sheets, workbookId);
        break;
      case 'SORT_RANGE':
        this.structural.applySortRange(action, sheets, workbookId);
        break;
      case 'MERGE_CELLS':
        this.structural.applyMergeCells(action, sheets);
        break;
      case 'UNMERGE_CELLS':
        this.structural.applyUnmergeCells(action, sheets);
        break;
    }
  }

  private applySetCell(
    action: { sheetId: string; cellRef: string; value: CellValue; formula?: string },
    sheets: Sheet[],
    workbookId: string,
  ): void {
    const sheet = sheets.find((s) => s.id === action.sheetId);
    if (!sheet) return;

    // Resolve merged cell edits to top-left cell of the merge range
    const resolvedRef = this.resolveMergedCellRef(action.cellRef, sheet.merges);

    const sheetIdx = sheets.indexOf(sheet);
    const { col, row } = parseCellRef(resolvedRef);

    sheet.cells[resolvedRef] = {
      value: action.formula ? null : action.value,
      formula: action.formula,
      computedValue: action.formula ? undefined : action.value,
      type: action.formula ? 'formula' : this.inferType(action.value),
    };

    this.expandUsedRange(sheet, col, row);
    const hfValue = action.formula ?? action.value;
    this.recalc.setCellInHf(workbookId, sheetIdx, col, row, hfValue);
  }

  /** If cellRef falls inside a merge range, return the top-left cell ref instead */
  private resolveMergedCellRef(cellRef: string, merges: MergeRange[]): string {
    const { col, row } = parseCellRef(cellRef);
    for (const merge of merges) {
      if (
        row >= merge.startRow && row <= merge.endRow &&
        col >= merge.startCol && col <= merge.endCol
      ) {
        return buildCellRef(merge.startCol, merge.startRow);
      }
    }
    return cellRef;
  }

  private applySetRange(
    action: { sheetId: string; range: { startRow: number; endRow: number; startCol: number; endCol: number }; values: CellValue[][] },
    sheets: Sheet[],
    workbookId: string,
  ): void {
    const sheet = sheets.find((s) => s.id === action.sheetId);
    if (!sheet) return;

    const { startRow, startCol } = action.range;
    const sheetIdx = sheets.indexOf(sheet);

    for (let r = 0; r < action.values.length; r++) {
      const actualRow = startRow + r;
      if (actualRow >= SHEET_LIMITS.MAX_ROWS) break;

      const rowValues = action.values[r];
      if (!rowValues) continue;
      for (let c = 0; c < rowValues.length; c++) {
        const actualCol = startCol + c;
        if (actualCol >= SHEET_LIMITS.MAX_COLS) break;

        const value = rowValues[c] ?? null;
        const ref = buildCellRef(actualCol, actualRow);
        const isFormula = typeof value === 'string' && value.startsWith('=');
        sheet.cells[ref] = {
          value: isFormula ? null : value,
          formula: isFormula ? value : undefined,
          computedValue: isFormula ? undefined : value,
          type: isFormula ? 'formula' : this.inferType(value),
        };
        this.recalc.setCellInHf(workbookId, sheetIdx, actualCol, actualRow, value);
      }
    }

    this.expandUsedRange(sheet, startCol, startRow);
    const lastRow = Math.min(startRow + action.values.length - 1, SHEET_LIMITS.MAX_ROWS - 1);
    const lastCol = Math.min(
      startCol + (action.values[0]?.length ?? 1) - 1,
      SHEET_LIMITS.MAX_COLS - 1,
    );
    this.expandUsedRange(sheet, lastCol, lastRow);
  }

  private applyCreateSheet(action: { name: string }, sheets: Sheet[], workbookId: string): void {
    const sheetName = sanitizeSheetName(action.name);
    sheets.push({
      id: createId(),
      name: sheetName,
      cells: {},
      merges: [],
      columnWidths: {},
      rowHeights: {},
      frozenRows: 0,
      frozenCols: 0,
      usedRange: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
    });
    this.recalc.addSheetToHf(workbookId, sheetName);
  }

  private applyDeleteSheet(action: { sheetId: string }, sheets: Sheet[], workbookId: string): void {
    const idx = sheets.findIndex((s) => s.id === action.sheetId);
    if (idx !== -1) {
      sheets.splice(idx, 1);
      this.recalc.removeSheetFromHf(workbookId, idx);
    }
  }

  private applyRenameSheet(action: { sheetId: string; name: string }, sheets: Sheet[]): void {
    const sheet = sheets.find((s) => s.id === action.sheetId);
    if (sheet) sheet.name = sanitizeSheetName(action.name);
  }

  private applyFormatCells(
    action: { sheetId: string; range: { startRow: number; endRow: number; startCol: number; endCol: number }; format: Record<string, unknown> },
    sheets: Sheet[],
  ): void {
    const sheet = sheets.find((s) => s.id === action.sheetId);
    if (!sheet) return;

    for (let r = action.range.startRow; r <= action.range.endRow; r++) {
      for (let c = action.range.startCol; c <= action.range.endCol; c++) {
        const ref = buildCellRef(c, r);
        let cell = sheet.cells[ref];
        if (!cell) {
          // Create an empty cell to hold the format — common when AI sends
          // FORMAT_CELLS before or without SET_CELL for the same range
          cell = { value: null, computedValue: null, type: 'empty' };
          sheet.cells[ref] = cell;
        }
        cell.format = { ...cell.format, ...action.format } as typeof cell.format;
      }
    }
  }

  private inferType(value: CellValue): 'string' | 'number' | 'boolean' | 'empty' {
    if (value === null || value === undefined) return 'empty';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
  }

  private expandUsedRange(sheet: Sheet, col: number, row: number): void {
    const ur = sheet.usedRange;
    if (Object.keys(sheet.cells).length <= 1) {
      ur.startRow = row;
      ur.startCol = col;
      ur.endRow = row;
      ur.endCol = col;
    } else {
      ur.startRow = Math.min(ur.startRow, row);
      ur.startCol = Math.min(ur.startCol, col);
      ur.endRow = Math.max(ur.endRow, row);
      ur.endCol = Math.max(ur.endCol, col);
    }
  }
}
