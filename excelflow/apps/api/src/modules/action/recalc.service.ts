import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import HyperFormula, { AlwaysSparse } from 'hyperformula';
import type { Sheet, CellValue, WorkbookClassification } from '@excelflow/shared';
import { parseCellRef, buildCellRef } from '@excelflow/shared';

/** HyperFormula instance cache per workbook */
const hfInstances = new Map<string, HyperFormula>();

/** Last-access timestamps for TTL eviction (30 min idle) */
const hfLastAccess = new Map<string, number>();
const HF_TTL_MS = 30 * 60 * 1000;
const HF_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class RecalcService implements OnModuleDestroy {
  private readonly logger = new Logger(RecalcService.name);
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.sweepTimer = setInterval(() => this.evictIdleInstances(), HF_SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    for (const [id, hf] of hfInstances) {
      hf.destroy();
      this.logger.log(`Destroyed HF instance ${id} on shutdown`);
    }
    hfInstances.clear();
    hfLastAccess.clear();
  }

  /** Evict HyperFormula instances idle longer than TTL */
  private evictIdleInstances(): void {
    const now = Date.now();
    for (const [id, lastAccess] of hfLastAccess) {
      if (now - lastAccess > HF_TTL_MS) {
        this.destroyInstance(id);
        this.logger.log(`Evicted idle HF instance for workbook ${id}`);
      }
    }
  }

  private touchAccess(workbookId: string): void {
    hfLastAccess.set(workbookId, Date.now());
  }

  /**
   * Initialize or get HyperFormula instance for a workbook.
   */
  getOrCreateInstance(workbookId: string, sheets: Sheet[]): HyperFormula {
    const existing = hfInstances.get(workbookId);
    if (existing) return existing;

    const sheetData: Record<string, (string | number | boolean | null)[][]> = {};

    for (const sheet of sheets) {
      const rows: (string | number | boolean | null)[][] = [];
      const { endRow, endCol } = sheet.usedRange;

      for (let r = 0; r <= endRow; r++) {
        const row: (string | number | boolean | null)[] = [];
        for (let c = 0; c <= endCol; c++) {
          const ref = buildCellRef(c, r);
          const cell = sheet.cells[ref];
          if (cell?.formula) {
            row.push(cell.formula);
          } else {
            row.push(cell?.value ?? null);
          }
        }
        rows.push(row);
      }
      sheetData[sheet.name] = rows;
    }

    const hf = HyperFormula.buildFromSheets(sheetData, {
      licenseKey: 'gpl-v3',
      chooseAddressMappingPolicy: new AlwaysSparse(),
    });

    hfInstances.set(workbookId, hf);
    this.touchAccess(workbookId);
    this.logger.log(`Created HyperFormula instance for workbook ${workbookId}`);
    return hf;
  }

  /**
   * Recalculate after changes. Returns map of changed cells.
   */
  recalculate(
    workbookId: string,
    sheets: Sheet[],
    _classification: WorkbookClassification,
  ): Record<string, Record<string, CellValue>> {
    const hf = this.getOrCreateInstance(workbookId, sheets);
    this.touchAccess(workbookId);
    const changes: Record<string, Record<string, CellValue>> = {};

    for (let sheetIdx = 0; sheetIdx < sheets.length; sheetIdx++) {
      const sheet = sheets[sheetIdx]!;
      const sheetChanges: Record<string, CellValue> = {};

      for (const [ref, cell] of Object.entries(sheet.cells)) {
        if (!cell.formula) continue;

        try {
          const { col, row } = parseCellRef(ref);
          const value = hf.getCellValue({ sheet: sheetIdx, row, col });

          const newValue = this.normalizeHfValue(value);
          if (newValue !== cell.computedValue) {
            cell.computedValue = newValue;
            sheetChanges[ref] = newValue;
          }
        } catch (err) {
          this.logger.warn(`Recalc error at ${sheet.name}!${ref}: ${err}`);
          cell.computedValue = null;
          sheetChanges[ref] = null;
        }
      }

      if (Object.keys(sheetChanges).length > 0) {
        changes[sheet.id] = sheetChanges;
      }
    }

    return changes;
  }

  /**
   * Apply a single cell change to HyperFormula.
   * Wrapped in try-catch because setCellContents can throw during
   * suspended evaluation when formulas reference newly-added sheets.
   * The canonical model still holds the formula; recalculate() will
   * pick it up after evaluation resumes.
   */
  setCellInHf(
    workbookId: string,
    sheetIndex: number,
    col: number,
    row: number,
    value: string | number | boolean | null,
  ): void {
    const hf = hfInstances.get(workbookId);
    if (!hf) return;
    try {
      hf.setCellContents({ sheet: sheetIndex, row, col }, [[value]]);
    } catch (err) {
      this.logger.warn(
        `HF setCellContents failed at sheet=${sheetIndex} row=${row} col=${col}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Suspend evaluation for bulk operations */
  suspendEvaluation(workbookId: string): void {
    hfInstances.get(workbookId)?.suspendEvaluation();
  }

  /** Resume evaluation after bulk operations */
  resumeEvaluation(workbookId: string): void {
    hfInstances.get(workbookId)?.resumeEvaluation();
  }

  /** Add a new sheet to an existing HyperFormula instance */
  addSheetToHf(workbookId: string, sheetName: string): void {
    const hf = hfInstances.get(workbookId);
    if (!hf) return;
    const result = hf.addSheet(sheetName);
    this.logger.log(`Added sheet "${sheetName}" to HF instance (sheetId=${String(result)})`);
  }

  /** Remove a sheet from an existing HyperFormula instance */
  removeSheetFromHf(workbookId: string, sheetIndex: number): void {
    const hf = hfInstances.get(workbookId);
    if (!hf) return;
    hf.removeSheet(sheetIndex);
    this.logger.log(`Removed sheet index ${sheetIndex} from HF instance`);
  }

  /** Rebuild a single sheet in HyperFormula after structural changes (row/col insert/delete/sort) */
  rebuildSheet(workbookId: string, sheetIndex: number, sheet: Sheet): void {
    const hf = hfInstances.get(workbookId);
    if (!hf) return;

    const { endRow, endCol } = sheet.usedRange;
    for (let r = 0; r <= endRow; r++) {
      for (let c = 0; c <= endCol; c++) {
        const ref = buildCellRef(c, r);
        const cell = sheet.cells[ref];
        const value = cell?.formula ?? cell?.value ?? null;
        try {
          hf.setCellContents({ sheet: sheetIndex, row: r, col: c }, [[value]]);
        } catch {
          // Formula may reference unresolved sheets; recalculate() handles it later
        }
      }
    }
    this.logger.log(`Rebuilt HF sheet index ${sheetIndex} (${sheet.name})`);
  }

  /** Destroy instance when workbook is closed or deleted */
  destroyInstance(workbookId: string): void {
    const hf = hfInstances.get(workbookId);
    if (hf) {
      hf.destroy();
      hfInstances.delete(workbookId);
      hfLastAccess.delete(workbookId);
    }
  }

  /**
   * Re-sync formula cells into HyperFormula after evaluation resumes.
   * During suspended evaluation, setCellContents can fail for formulas
   * referencing newly-added sheets. This pass re-sets those formulas
   * now that evaluation is active and all sheets exist.
   */
  resyncFormulas(workbookId: string, sheets: Sheet[]): void {
    const hf = hfInstances.get(workbookId);
    if (!hf) return;

    let resynced = 0;
    for (let sheetIdx = 0; sheetIdx < sheets.length; sheetIdx++) {
      const sheet = sheets[sheetIdx]!;
      for (const [ref, cell] of Object.entries(sheet.cells)) {
        if (!cell.formula) continue;
        try {
          const { col, row } = parseCellRef(ref);
          hf.setCellContents({ sheet: sheetIdx, row, col }, [[cell.formula]]);
          resynced++;
        } catch (err) {
          this.logger.warn(`Resync failed for ${sheet.name}!${ref}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
    if (resynced > 0) {
      this.logger.log(`Resynced ${resynced} formula cells in HF for workbook ${workbookId}`);
    }
  }

  private normalizeHfValue(value: unknown): CellValue {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value;
    // HyperFormula returns DetailedCellError objects for formula errors
    // These have a .type property (e.g., 'REF') and a .value property (e.g., '#REF!')
    if (typeof value === 'object' && value !== null && 'value' in value) {
      const errVal = (value as { value: unknown }).value;
      if (typeof errVal === 'string') return errVal;
    }
    return String(value);
  }
}
