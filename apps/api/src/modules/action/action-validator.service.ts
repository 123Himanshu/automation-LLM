import { Injectable } from '@nestjs/common';
import type { Action, Sheet } from '@excelflow/shared';
import {
  parseCellRef, SHEET_LIMITS, ACTION_LIMITS,
  validateFormulaFunctions,
} from '@excelflow/shared';

interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

@Injectable()
export class ActionValidatorService {
  validate(actions: Action[], sheets: Sheet[]): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const sheetMap = new Map(sheets.map((s) => [s.id, s]));
    const sheetNameMap = new Map(sheets.map((s) => [s.name, s]));

    // Collect sheet names being created in this batch
    const pendingSheetNames = new Set<string>();
    for (const a of actions) {
      if (a.type === 'CREATE_SHEET') pendingSheetNames.add(a.name);
    }

    // Hard batch size limit — reject outright above 5000 actions
    if (actions.length > ACTION_LIMITS.MAX_BATCH_SIZE) {
      errors.push(
        `Action batch too large: ${actions.length} actions exceeds maximum of ${ACTION_LIMITS.MAX_BATCH_SIZE}. ` +
        `Split into smaller batches.`,
      );
      return { valid: false, warnings, errors };
    }

    // Soft warning for large batches
    if (actions.length > 1000) {
      warnings.push(
        `Large action batch: ${actions.length} actions. Consider splitting into smaller batches.`,
      );
    }

    for (const action of actions) {
      switch (action.type) {
        case 'SET_CELL':
          this.validateSetCell(action, sheetMap, errors, warnings, sheetNameMap, pendingSheetNames);
          break;
        case 'SET_RANGE':
          this.validateSetRange(action, sheetMap, errors, warnings, sheetNameMap, pendingSheetNames);
          break;
        case 'FORMAT_CELLS':
        case 'SORT_RANGE':
        case 'MERGE_CELLS':
        case 'UNMERGE_CELLS':
          this.validateSheetExists(action.sheetId, sheetMap, errors, sheetNameMap, pendingSheetNames);
          this.validateRangeBounds(action.range, warnings);
          break;
        case 'INSERT_ROWS':
        case 'DELETE_ROWS':
          this.validateSheetExists(action.sheetId, sheetMap, errors, sheetNameMap, pendingSheetNames);
          this.validateRowBounds(action.startRow, action.count, warnings);
          break;
        case 'INSERT_COLS':
        case 'DELETE_COLS':
          this.validateSheetExists(action.sheetId, sheetMap, errors, sheetNameMap, pendingSheetNames);
          this.validateColBounds(action.startCol, action.count, warnings);
          break;
        case 'CREATE_SHEET':
          this.validateCreateSheet(action.name, sheets, errors);
          break;
        case 'DELETE_SHEET':
          this.validateDeleteSheet(action.sheetId, sheetMap, sheets, errors, warnings, sheetNameMap, pendingSheetNames);
          break;
        case 'RENAME_SHEET':
          this.validateRenameSheet(action.sheetId, action.name, sheetMap, sheets, errors, sheetNameMap, pendingSheetNames);
          break;
      }
    }

    return { valid: errors.length === 0, warnings, errors };
  }

  private validateSetCell(
    action: { sheetId: string; cellRef: string; formula?: string },
    sheetMap: Map<string, Sheet>,
    errors: string[],
    warnings: string[],
    sheetNameMap?: Map<string, Sheet>,
    pendingSheetNames?: Set<string>,
  ): void {
    this.validateSheetExists(action.sheetId, sheetMap, errors, sheetNameMap, pendingSheetNames);
    try {
      const { col, row } = parseCellRef(action.cellRef);
      if (row >= SHEET_LIMITS.MAX_ROWS) {
        errors.push(`Row ${row + 1} exceeds max rows (${SHEET_LIMITS.MAX_ROWS})`);
      }
      if (col >= SHEET_LIMITS.MAX_COLS) {
        errors.push(`Column ${col + 1} exceeds max columns (${SHEET_LIMITS.MAX_COLS})`);
      }
    } catch {
      errors.push(`Invalid cell reference: ${action.cellRef}`);
    }

    // Formula validation (Fixes Problems 10, 14)
    if (action.formula) {
      if (!action.formula.startsWith('=')) {
        errors.push(`Formula must start with '=': ${action.formula}`);
      } else {
        this.validateFormula(action.formula, action.cellRef, warnings);
      }
    }
  }

  /**
   * Validate formula functions against whitelist and check for volatile functions.
   * Fixes Problem 10 (invalid functions) and Problem 14 (volatile functions).
   */
  private validateFormula(
    formula: string,
    cellRef: string,
    warnings: string[],
  ): void {
    const result = validateFormulaFunctions(formula);

    if (result.unsupported.length > 0) {
      warnings.push(
        `Cell ${cellRef}: formula uses unsupported function(s): ${result.unsupported.join(', ')}. ` +
        `This may cause #NAME? errors.`,
      );
    }

    if (result.volatile.length > 0) {
      warnings.push(
        `Cell ${cellRef}: formula uses volatile function(s): ${result.volatile.join(', ')}. ` +
        `These recalculate on every change and may impact performance.`,
      );
    }
  }

  private validateSetRange(
    action: {
      sheetId: string;
      range: { startRow: number; endRow: number; startCol: number; endCol: number };
      values: unknown[][];
    },
    sheetMap: Map<string, Sheet>,
    errors: string[],
    warnings: string[],
    sheetNameMap?: Map<string, Sheet>,
    pendingSheetNames?: Set<string>,
  ): void {
    this.validateSheetExists(action.sheetId, sheetMap, errors, sheetNameMap, pendingSheetNames);

    const { startRow, startCol } = action.range;

    // Auto-correct range to match actual values array
    if (action.values.length > 0) {
      const actualRows = action.values.length;
      const actualCols = Math.max(...action.values.map((r) => (Array.isArray(r) ? r.length : 0)), 1);
      const expectedRows = action.range.endRow - startRow + 1;

      if (actualRows !== expectedRows) {
        warnings.push(
          `SET_RANGE: auto-corrected endRow from ${action.range.endRow} to ${startRow + actualRows - 1} ` +
          `(values has ${actualRows} rows, range specified ${expectedRows})`,
        );
        (action.range as { endRow: number }).endRow = startRow + actualRows - 1;
        (action.range as { endCol: number }).endCol = startCol + actualCols - 1;
      }
    }

    const { endRow, endCol } = action.range;

    if (endRow >= SHEET_LIMITS.MAX_ROWS || endCol >= SHEET_LIMITS.MAX_COLS) {
      warnings.push('Range exceeds sheet bounds. Data will be truncated.');
    }

    const totalCells = (endRow - startRow + 1) * (endCol - startCol + 1);
    if (totalCells > ACTION_LIMITS.ASYNC_PASTE_THRESHOLD) {
      warnings.push(`Large paste: ${totalCells.toLocaleString()} cells. May run asynchronously.`);
    }
  }

  /**
   * Check for cross-sheet formula dependencies before allowing sheet deletion.
   * Fixes Problem 8.
   */
  private validateDeleteSheet(
    sheetId: string,
    sheetMap: Map<string, Sheet>,
    sheets: Sheet[],
    errors: string[],
    warnings: string[],
    sheetNameMap?: Map<string, Sheet>,
    pendingSheetNames?: Set<string>,
  ): void {
    this.validateSheetExists(sheetId, sheetMap, errors, sheetNameMap, pendingSheetNames);

    if (sheets.length <= 1) {
      errors.push('Cannot delete the last sheet');
      return;
    }

    // Find the sheet being deleted (by ID or name)
    const targetSheet = sheetMap.get(sheetId) ?? sheetNameMap?.get(sheetId);
    if (!targetSheet) return;

    // Scan other sheets for formulas referencing this sheet (Fixes Problem 8)
    const dependentFormulas: string[] = [];
    for (const otherSheet of sheets) {
      if (otherSheet.id === targetSheet.id) continue;
      for (const [ref, cell] of Object.entries(otherSheet.cells)) {
        if (cell.formula && this.formulaReferencesSheet(cell.formula, targetSheet.name)) {
          dependentFormulas.push(`${otherSheet.name}!${ref}`);
        }
      }
    }

    if (dependentFormulas.length > 0) {
      const sample = dependentFormulas.slice(0, 5).join(', ');
      const more = dependentFormulas.length > 5 ? ` and ${dependentFormulas.length - 5} more` : '';
      warnings.push(
        `Deleting sheet "${targetSheet.name}" will break ${dependentFormulas.length} formula(s) ` +
        `in other sheets: ${sample}${more}. These will show #REF! errors.`,
      );
    }
  }

  /** Check if a formula references a specific sheet name */
  private formulaReferencesSheet(formula: string, sheetName: string): boolean {
    // Match both quoted and unquoted sheet references
    const escaped = sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`('${escaped}'|${escaped})!`, 'i');
    return pattern.test(formula);
  }

  private validateRangeBounds(
    range: { startRow: number; endRow: number; startCol: number; endCol: number },
    warnings: string[],
  ): void {
    if (range.endRow >= SHEET_LIMITS.MAX_ROWS || range.endCol >= SHEET_LIMITS.MAX_COLS) {
      warnings.push('Range extends beyond sheet bounds and will be clamped.');
    }
  }

  private validateRowBounds(startRow: number, count: number, warnings: string[]): void {
    if (startRow + count > SHEET_LIMITS.MAX_ROWS) {
      warnings.push(`Row operation would exceed max rows (${SHEET_LIMITS.MAX_ROWS}).`);
    }
  }

  private validateColBounds(startCol: number, count: number, warnings: string[]): void {
    if (startCol + count > SHEET_LIMITS.MAX_COLS) {
      warnings.push(`Column operation would exceed max columns (${SHEET_LIMITS.MAX_COLS}).`);
    }
  }

  private validateSheetExists(
    sheetId: string,
    sheetMap: Map<string, Sheet>,
    errors: string[],
    sheetNameMap?: Map<string, Sheet>,
    pendingSheetNames?: Set<string>,
  ): void {
    if (sheetMap.has(sheetId)) return;
    if (sheetNameMap?.has(sheetId)) return;
    if (pendingSheetNames?.has(sheetId)) return;
    errors.push(`Sheet not found: ${sheetId}`);
  }

  private validateCreateSheet(name: string, sheets: Sheet[], errors: string[]): void {
    if (sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      errors.push(`Sheet name already exists: ${name}`);
    }
  }

  private validateRenameSheet(
    sheetId: string,
    name: string,
    sheetMap: Map<string, Sheet>,
    sheets: Sheet[],
    errors: string[],
    sheetNameMap?: Map<string, Sheet>,
    pendingSheetNames?: Set<string>,
  ): void {
    this.validateSheetExists(sheetId, sheetMap, errors, sheetNameMap, pendingSheetNames);
    const conflict = sheets.find(
      (s) => s.id !== sheetId && s.name.toLowerCase() === name.toLowerCase(),
    );
    if (conflict) {
      errors.push(`Sheet name already exists: ${name}`);
    }
  }
}
