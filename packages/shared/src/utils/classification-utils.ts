import { CLASSIFICATION_THRESHOLDS } from '../constants/limits';
import type { WorkbookClassification, WorkbookMetrics } from '../types/workbook-types';

/**
 * Classify workbook based on computed metrics.
 * Returns 'normal', 'large', or 'heavy'.
 */
export function classifyWorkbook(metrics: WorkbookMetrics): WorkbookClassification {
  const {
    usedCells,
    formulaCount,
    volatileCount,
    crossSheetDeps,
    maxColumns,
  } = metrics;

  const T = CLASSIFICATION_THRESHOLDS;

  // Heavy: massive data or complex cross-sheet + formula combos
  if (
    usedCells > T.HEAVY_CELL_COUNT ||
    (crossSheetDeps > T.HEAVY_CROSS_SHEET_DEPS && formulaCount > T.HEAVY_FORMULA_COUNT) ||
    volatileCount > T.HEAVY_VOLATILE_COUNT
  ) {
    return 'heavy';
  }

  // Large: significant data or formula density
  if (
    usedCells > T.LARGE_CELL_COUNT ||
    formulaCount > T.LARGE_FORMULA_COUNT ||
    maxColumns > T.LARGE_COLUMN_COUNT ||
    volatileCount > T.LARGE_VOLATILE_COUNT
  ) {
    return 'large';
  }

  return 'normal';
}
