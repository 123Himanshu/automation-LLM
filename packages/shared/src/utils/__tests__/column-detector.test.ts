import { describe, it, expect } from 'vitest';
import { isDateValue } from '../cell-utils';

/**
 * Tests for column type detection logic.
 * The actual ColumnDetectorService lives in the API, but the core
 * detection helpers (isDateValue) and the classification logic
 * are testable from shared utils.
 */

// Replicate the detection logic from column-detector.service.ts
type CellValue = string | number | boolean | null;
type ColumnType = 'numeric' | 'date' | 'category' | 'text' | 'empty';

function detectColumnType(values: CellValue[]): ColumnType {
  const nonEmpty = values.filter((v) => v !== null && v !== '' && v !== undefined);
  if (nonEmpty.length === 0) return 'empty';

  const numericCount = nonEmpty.filter((v) => typeof v === 'number').length;
  const dateCount = nonEmpty.filter((v) => isDateValue(v)).length;

  if (numericCount / nonEmpty.length > 0.8) return 'numeric';
  if (dateCount / nonEmpty.length > 0.8) return 'date';

  const uniqueRatio = new Set(nonEmpty.map(String)).size / nonEmpty.length;
  if (uniqueRatio < 0.3 && nonEmpty.length > 5) return 'category';

  return 'text';
}

function computeNumericStats(values: number[]): { sum: number; min: number; max: number; mean: number } {
  const sum = values.reduce((a, b) => a + b, 0);
  return { sum, min: Math.min(...values), max: Math.max(...values), mean: sum / values.length };
}

describe('detectColumnType', () => {
  it('returns "empty" for all-null values', () => {
    expect(detectColumnType([null, null, null])).toBe('empty');
  });

  it('returns "empty" for all-empty-string values', () => {
    expect(detectColumnType(['', '', ''])).toBe('empty');
  });

  it('returns "numeric" when >80% are numbers', () => {
    // 4/5 = 0.8, threshold is > 0.8, so need 5/6
    expect(detectColumnType([1, 2, 3, 4, 5, 'text'])).toBe('numeric');
    // 4/5 = exactly 0.8, not > 0.8, so this is "text"
    expect(detectColumnType([1, 2, 3, 4, 'text'])).toBe('text');
  });

  it('returns "text" when mixed types', () => {
    expect(detectColumnType([1, 'hello', true, 'world'])).toBe('text');
  });

  it('returns "category" for low unique ratio with enough values', () => {
    const values: CellValue[] = ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'];
    expect(detectColumnType(values)).toBe('category');
  });

  it('returns "text" for high unique ratio', () => {
    const values: CellValue[] = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
    expect(detectColumnType(values)).toBe('text');
  });

  it('returns "date" when >80% are date-like strings', () => {
    // 5/6 > 0.8 threshold
    const values: CellValue[] = ['2024-01-01', '2024-02-15', '2024-03-20', '2024-04-10', '2024-05-01', 'not-a-date'];
    expect(detectColumnType(values)).toBe('date');
    // 4/5 = exactly 0.8, not > 0.8
    expect(detectColumnType(['2024-01-01', '2024-02-15', '2024-03-20', '2024-04-10', 'nope'])).toBe('text');
  });

  it('returns "numeric" for Excel serial dates (numbers)', () => {
    // Serial dates are numbers, so they classify as numeric
    expect(detectColumnType([44927, 44928, 44929, 44930, 44931])).toBe('numeric');
  });
});

describe('computeNumericStats', () => {
  it('computes correct stats for positive numbers', () => {
    const stats = computeNumericStats([10, 20, 30, 40, 50]);
    expect(stats.sum).toBe(150);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(50);
    expect(stats.mean).toBe(30);
  });

  it('handles negative numbers', () => {
    const stats = computeNumericStats([-5, 0, 5]);
    expect(stats.sum).toBe(0);
    expect(stats.min).toBe(-5);
    expect(stats.max).toBe(5);
    expect(stats.mean).toBeCloseTo(0);
  });

  it('handles single value', () => {
    const stats = computeNumericStats([42]);
    expect(stats.sum).toBe(42);
    expect(stats.min).toBe(42);
    expect(stats.max).toBe(42);
    expect(stats.mean).toBe(42);
  });

  it('handles decimals', () => {
    const stats = computeNumericStats([1.5, 2.5, 3.5]);
    expect(stats.sum).toBeCloseTo(7.5);
    expect(stats.mean).toBeCloseTo(2.5);
  });
});
