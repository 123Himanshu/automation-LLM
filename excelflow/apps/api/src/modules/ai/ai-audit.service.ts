import { Injectable, Logger } from '@nestjs/common';
import { WorkbookService } from '../workbook/workbook.service';
import { ActionService } from '../action/action.service';
import type { Sheet, Action, CellValue } from '@excelflow/shared';
import { buildCellRef } from '@excelflow/shared';

/** HyperFormula error patterns that indicate broken formulas */
const HF_ERROR_PATTERNS = [
  '#REF!', '#NAME?', '#VALUE!', '#DIV/0!', '#NULL!', '#N/A', '#ERROR!', '#NUM!',
  '#CYCLE!', '#SPILL!',
] as const;

interface AuditFinding {
  cellRef: string;
  sheetId: string;
  sheetName: string;
  issue: 'formula_error' | 'null_formula' | 'type_mismatch' | 'empty_expected_value';
  expected: string;
  actual: CellValue;
  formula?: string;
}

interface AuditResult {
  passed: boolean;
  findings: AuditFinding[];
  correctionsMade: number;
  message: string;
}

/** Function type for LLM-powered correction (injected to avoid circular deps) */
type LLMCorrectionFn = (
  errorDescription: string,
  sheetContext: string,
) => Promise<Action[]>;

@Injectable()
export class AIAuditService {
  private readonly logger = new Logger(AIAuditService.name);
  private static readonly MAX_LOCAL_PASSES = 2;
  private llmCorrectionFn: LLMCorrectionFn | null = null;

  constructor(
    private readonly workbookService: WorkbookService,
    private readonly actionService: ActionService,
  ) {}

  /** Wire in the LLM correction function (called from AISummaryService on bootstrap) */
  setLLMCorrectionFunction(fn: LLMCorrectionFn): void {
    this.llmCorrectionFn = fn;
    this.logger.log('LLM correction function wired into audit service');
  }

  /**
   * Audit a sheet after AI actions. Checks formula cells for errors.
   * Three-phase correction: local fix → LLM fix → report to user.
   * Fixes Problem 12 (closed-loop audit).
   */
  async auditSheet(
    workbookId: string,
    sheetId: string,
    originalActions: Action[],
    latestRevisionId: string,
  ): Promise<AuditResult> {
    const allFindings: AuditFinding[] = [];
    let totalCorrections = 0;
    let currentRevisionId = latestRevisionId;

    // Phase 1: Local auto-corrections (syntax fixes, re-evaluation)
    for (let pass = 0; pass < AIAuditService.MAX_LOCAL_PASSES; pass++) {
      const sheet = await this.getSheet(workbookId, sheetId);
      if (!sheet) {
        return this.fail(`Sheet ${sheetId} not found`);
      }

      const findings = this.scanForIssues(sheet, originalActions);
      if (findings.length === 0) {
        return this.pass(pass, totalCorrections, sheet.name);
      }

      this.logger.warn(`[Audit] Local pass ${pass + 1}: ${findings.length} issue(s) in "${sheet.name}"`);
      allFindings.push(...findings);

      const corrections = this.generateLocalCorrections(findings, sheet);
      if (corrections.length === 0) break;

      const result = await this.applyCorrections(workbookId, currentRevisionId, corrections, pass + 1);
      if (!result) break;
      currentRevisionId = result.revisionId;
      totalCorrections += corrections.length;
    }

    // Phase 2: LLM-powered correction (if local fixes didn't resolve everything)
    const postLocalSheet = await this.getSheet(workbookId, sheetId);
    if (postLocalSheet) {
      const remainingFindings = this.scanForIssues(postLocalSheet, originalActions);
      if (remainingFindings.length > 0 && this.llmCorrectionFn) {
        this.logger.log(`[Audit] ${remainingFindings.length} issues remain — invoking LLM correction`);
        const llmResult = await this.tryLLMCorrection(
          workbookId, sheetId, currentRevisionId, remainingFindings, postLocalSheet,
        );
        if (llmResult) {
          currentRevisionId = llmResult.revisionId;
          totalCorrections += llmResult.correctionCount;
        }
      }
    }

    // Phase 3: Final check
    const finalSheet = await this.getSheet(workbookId, sheetId);
    const finalIssues = finalSheet ? this.scanForIssues(finalSheet, originalActions) : [];
    const passed = finalIssues.length === 0;

    const message = passed
      ? `Audit passed after corrections — ${totalCorrections} cell(s) fixed`
      : `Audit completed with ${finalIssues.length} unresolvable issue(s) after ${totalCorrections} correction(s)`;

    this.logger.log(`[Audit] Final: ${message}`);
    return { passed, findings: allFindings, correctionsMade: totalCorrections, message };
  }

  /**
   * Phase 2: Feed errors back to LLM for intelligent correction.
   * The LLM sees the exact error cells and formulas, and returns fix actions.
   */
  private async tryLLMCorrection(
    workbookId: string,
    sheetId: string,
    revisionId: string,
    findings: AuditFinding[],
    sheet: Sheet,
  ): Promise<{ revisionId: string; correctionCount: number } | null> {
    if (!this.llmCorrectionFn) return null;

    try {
      const errorDesc = findings.map((f) => {
        const formulaPart = f.formula ? ` (formula: ${f.formula})` : '';
        return `Cell ${f.cellRef}: ${f.issue} — got "${f.actual}"${formulaPart}`;
      }).join('\n');

      const sheetContext = `Sheet "${sheet.name}" (id: ${sheetId}). ` +
        `Fix these formula errors by returning corrective SET_CELL actions:`;

      const corrections = await this.llmCorrectionFn(errorDesc, sheetContext);
      if (corrections.length === 0) return null;

      // Resolve sheet IDs in corrections
      const resolvedCorrections = corrections.map((a) => {
        if ('sheetId' in a && (a as Record<string, unknown>)['sheetId'] === sheet.name) {
          return { ...a, sheetId } as Action;
        }
        if ('sheetId' in a && (a as Record<string, unknown>)['sheetId'] === '__AUDIT__') {
          return { ...a, sheetId } as Action;
        }
        return a;
      });

      const result = await this.applyCorrections(workbookId, revisionId, resolvedCorrections, 'LLM');
      if (!result) return null;

      return { revisionId: result.revisionId, correctionCount: resolvedCorrections.length };
    } catch (err) {
      this.logger.error(`[Audit] LLM correction failed: ${err instanceof Error ? err.message : 'unknown'}`);
      return null;
    }
  }

  private scanForIssues(sheet: Sheet, originalActions: Action[]): AuditFinding[] {
    const findings: AuditFinding[] = [];
    const aiCellRefs = this.extractAffectedCells(originalActions, sheet.id);

    for (const [ref, cell] of Object.entries(sheet.cells)) {
      if (aiCellRefs.size > 0 && !aiCellRefs.has(ref)) continue;

      if (cell.formula) {
        const computed = cell.computedValue;

        if (typeof computed === 'string' && this.isFormulaError(computed)) {
          findings.push({
            cellRef: ref, sheetId: sheet.id, sheetName: sheet.name,
            issue: 'formula_error',
            expected: `valid result from ${cell.formula}`,
            actual: computed, formula: cell.formula,
          });
          continue;
        }

        if (computed === null || computed === undefined) {
          findings.push({
            cellRef: ref, sheetId: sheet.id, sheetName: sheet.name,
            issue: 'null_formula',
            expected: `computed value from ${cell.formula}`,
            actual: null, formula: cell.formula,
          });
          continue;
        }
      }

      if (!cell.formula && cell.value !== null && cell.value !== undefined) {
        if (cell.computedValue === null && cell.value !== null) {
          findings.push({
            cellRef: ref, sheetId: sheet.id, sheetName: sheet.name,
            issue: 'empty_expected_value',
            expected: String(cell.value), actual: cell.computedValue,
          });
        }
      }
    }

    return findings;
  }

  private generateLocalCorrections(findings: AuditFinding[], sheet: Sheet): Action[] {
    const corrections: Action[] = [];

    for (const finding of findings) {
      switch (finding.issue) {
        case 'formula_error': {
          const fixed = this.tryFixFormula(finding.formula ?? '', finding.actual, sheet);
          if (fixed) {
            corrections.push({
              type: 'SET_CELL', sheetId: finding.sheetId,
              cellRef: finding.cellRef, value: null, formula: fixed,
            });
          }
          break;
        }
        case 'null_formula': {
          if (finding.formula) {
            corrections.push({
              type: 'SET_CELL', sheetId: finding.sheetId,
              cellRef: finding.cellRef, value: null, formula: finding.formula,
            });
          }
          break;
        }
        case 'empty_expected_value': {
          const cell = sheet.cells[finding.cellRef];
          if (cell && cell.value !== null) {
            corrections.push({
              type: 'SET_CELL', sheetId: finding.sheetId,
              cellRef: finding.cellRef, value: cell.value,
            });
          }
          break;
        }
        default:
          break;
      }
    }

    return corrections;
  }

  private tryFixFormula(formula: string, errorValue: CellValue, _sheet: Sheet): string | null {
    const error = typeof errorValue === 'string' ? errorValue : '';

    if (error.includes('#REF!')) {
      const sheetRefMatch = formula.match(/=\w+\(([^'!]+)!/);
      if (sheetRefMatch?.[1]) {
        const unquotedName = sheetRefMatch[1];
        const fixed = formula.replace(`${unquotedName}!`, `'${unquotedName}'!`);
        if (fixed !== formula) return fixed;
      }
      return null;
    }

    if (error.includes('#NAME?')) {
      const typoFixes: Record<string, string> = {
        'COUNIFS': 'COUNTIFS', 'SUMIF ': 'SUMIFS',
        'AVERAGEIF': 'AVERAGEIFS', 'CONT': 'COUNT',
      };
      let fixed = formula;
      for (const [typo, correct] of Object.entries(typoFixes)) {
        if (fixed.includes(typo)) fixed = fixed.replace(typo, correct);
      }
      if (fixed !== formula) return fixed;

      const unescaped = formula.match(/,([A-Za-z][A-Za-z\s]+)\)/);
      if (unescaped?.[1]) {
        const fixed2 = formula.replace(`,${unescaped[1]})`, `,"${unescaped[1]}")`);
        if (fixed2 !== formula) return fixed2;
      }
      return null;
    }

    return null;
  }

  private async getSheet(workbookId: string, sheetId: string): Promise<Sheet | null> {
    const sheets = await this.workbookService.getSheets(workbookId);
    return sheets.find((s) => s.id === sheetId) ?? null;
  }

  private async applyCorrections(
    workbookId: string,
    revisionId: string,
    corrections: Action[],
    passLabel: number | string,
  ): Promise<{ revisionId: string; version: number } | null> {
    try {
      const result = await this.actionService.applyBatch({
        workbookId, revisionId, actions: corrections, source: 'system',
        metadata: { description: `AI audit correction pass ${passLabel}` },
      });
      this.logger.log(`[Audit] Applied ${corrections.length} correction(s) in pass ${passLabel}, rev v${result.version}`);
      return { revisionId: result.revisionId, version: result.version };
    } catch (err) {
      this.logger.error(`[Audit] Correction pass ${passLabel} failed: ${err instanceof Error ? err.message : 'unknown'}`);
      return null;
    }
  }

  private extractAffectedCells(actions: Action[], targetSheetId: string): Set<string> {
    const refs = new Set<string>();
    for (const action of actions) {
      if (!('sheetId' in action)) continue;
      const a = action as Record<string, unknown>;
      if (a['sheetId'] !== targetSheetId) continue;

      if (action.type === 'SET_CELL') {
        refs.add(action.cellRef);
      } else if (action.type === 'SET_RANGE') {
        const { startRow, endRow, startCol, endCol } = action.range;
        for (let r = startRow; r <= endRow; r++) {
          for (let c = startCol; c <= endCol; c++) {
            refs.add(buildCellRef(c, r));
          }
        }
      }
    }
    return refs;
  }

  private isFormulaError(value: string): boolean {
    return HF_ERROR_PATTERNS.some((pattern) => value.includes(pattern));
  }

  private pass(pass: number, corrections: number, sheetName: string): AuditResult {
    const msg = pass === 0
      ? `Audit passed — all cells correct for sheet "${sheetName}"`
      : `Audit passed after ${pass} pass(es) — ${corrections} cell(s) fixed`;
    this.logger.log(`[Audit] ${msg}`);
    return { passed: true, findings: [], correctionsMade: corrections, message: msg };
  }

  private fail(message: string): AuditResult {
    return { passed: false, findings: [], correctionsMade: 0, message };
  }
}
