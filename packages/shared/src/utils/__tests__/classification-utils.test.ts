import { describe, it, expect } from 'vitest';
import { classifyWorkbook } from '../classification-utils';
import type { WorkbookMetrics } from '../../types/workbook-types';

function makeMetrics(overrides: Partial<WorkbookMetrics> = {}): WorkbookMetrics {
  return {
    usedCells: 0,
    formulaCount: 0,
    volatileCount: 0,
    sheetCount: 1,
    crossSheetDeps: 0,
    maxColumns: 10,
    mergeCount: 0,
    styleDensity: 0,
    ...overrides,
  };
}

describe('classifyWorkbook', () => {
  it('returns "normal" for small workbooks', () => {
    expect(classifyWorkbook(makeMetrics())).toBe('normal');
    expect(classifyWorkbook(makeMetrics({ usedCells: 100_000 }))).toBe('normal');
  });

  it('returns "large" when usedCells > 500k', () => {
    expect(classifyWorkbook(makeMetrics({ usedCells: 500_001 }))).toBe('large');
  });

  it('returns "large" when formulaCount > 100k', () => {
    expect(classifyWorkbook(makeMetrics({ formulaCount: 100_001 }))).toBe('large');
  });

  it('returns "large" when maxColumns > 200', () => {
    expect(classifyWorkbook(makeMetrics({ maxColumns: 201 }))).toBe('large');
  });

  it('returns "large" when volatileCount > 50', () => {
    expect(classifyWorkbook(makeMetrics({ volatileCount: 51 }))).toBe('large');
  });

  it('returns "heavy" when usedCells > 2M', () => {
    expect(classifyWorkbook(makeMetrics({ usedCells: 2_000_001 }))).toBe('heavy');
  });

  it('returns "heavy" when volatileCount > 500', () => {
    expect(classifyWorkbook(makeMetrics({ volatileCount: 501 }))).toBe('heavy');
  });

  it('returns "heavy" for cross-sheet + formula combo', () => {
    expect(classifyWorkbook(makeMetrics({
      crossSheetDeps: 1001,
      formulaCount: 200_001,
    }))).toBe('heavy');
  });

  it('does NOT return "heavy" for cross-sheet alone', () => {
    expect(classifyWorkbook(makeMetrics({
      crossSheetDeps: 2000,
      formulaCount: 100,
    }))).toBe('normal');
  });

  it('boundary: exactly at large threshold is normal', () => {
    expect(classifyWorkbook(makeMetrics({ usedCells: 500_000 }))).toBe('normal');
  });

  it('boundary: exactly at heavy threshold is large', () => {
    expect(classifyWorkbook(makeMetrics({ usedCells: 2_000_000 }))).toBe('large');
  });
});
