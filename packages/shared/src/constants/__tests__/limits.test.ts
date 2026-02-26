import { describe, it, expect } from 'vitest';
import {
  CLASSIFICATION_THRESHOLDS,
  FILE_LIMITS,
  ACTION_LIMITS,
  PERFORMANCE,
  SHEET_LIMITS,
} from '../limits';

describe('CLASSIFICATION_THRESHOLDS', () => {
  it('has correct large thresholds', () => {
    expect(CLASSIFICATION_THRESHOLDS.LARGE_CELL_COUNT).toBe(500_000);
    expect(CLASSIFICATION_THRESHOLDS.LARGE_FORMULA_COUNT).toBe(100_000);
    expect(CLASSIFICATION_THRESHOLDS.LARGE_COLUMN_COUNT).toBe(200);
    expect(CLASSIFICATION_THRESHOLDS.LARGE_VOLATILE_COUNT).toBe(50);
  });

  it('has correct heavy thresholds', () => {
    expect(CLASSIFICATION_THRESHOLDS.HEAVY_CELL_COUNT).toBe(2_000_000);
    expect(CLASSIFICATION_THRESHOLDS.HEAVY_FORMULA_COUNT).toBe(200_000);
    expect(CLASSIFICATION_THRESHOLDS.HEAVY_VOLATILE_COUNT).toBe(500);
    expect(CLASSIFICATION_THRESHOLDS.HEAVY_CROSS_SHEET_DEPS).toBe(1_000);
  });

  it('has max cell count of 10M', () => {
    expect(CLASSIFICATION_THRESHOLDS.MAX_CELL_COUNT).toBe(10_000_000);
  });
});

describe('FILE_LIMITS', () => {
  it('has 50MB max upload size', () => {
    expect(FILE_LIMITS.MAX_UPLOAD_SIZE_BYTES).toBe(50 * 1024 * 1024);
  });

  it('allows xlsx and csv extensions', () => {
    expect(FILE_LIMITS.ALLOWED_EXTENSIONS).toContain('.xlsx');
    expect(FILE_LIMITS.ALLOWED_EXTENSIONS).toContain('.csv');
    expect(FILE_LIMITS.ALLOWED_EXTENSIONS).toHaveLength(2);
  });

  it('has cleanup age settings', () => {
    expect(FILE_LIMITS.FILE_CLEANUP_AGE_HOURS).toBe(24);
    expect(FILE_LIMITS.EXPORT_CLEANUP_AGE_HOURS).toBe(1);
  });
});

describe('ACTION_LIMITS', () => {
  it('has paste thresholds', () => {
    expect(ACTION_LIMITS.ASYNC_PASTE_THRESHOLD).toBe(50_000);
    expect(ACTION_LIMITS.HEAVY_PASTE_THRESHOLD).toBe(10_000);
  });

  it('has AI thresholds', () => {
    expect(ACTION_LIMITS.AI_CONFIRM_THRESHOLD).toBe(1_000);
    expect(ACTION_LIMITS.AI_ASYNC_THRESHOLD).toBe(10_000);
  });

  it('snapshots every 50 revisions', () => {
    expect(ACTION_LIMITS.REVISION_SNAPSHOT_INTERVAL).toBe(50);
  });
});

describe('SHEET_LIMITS', () => {
  it('has Excel-compatible max rows', () => {
    expect(SHEET_LIMITS.MAX_ROWS).toBe(1_048_576);
  });

  it('has Excel-compatible max columns', () => {
    expect(SHEET_LIMITS.MAX_COLS).toBe(16_384);
  });
});

describe('PERFORMANCE', () => {
  it('has debounce of 300ms', () => {
    expect(PERFORMANCE.CELL_EDIT_DEBOUNCE_MS).toBe(300);
  });

  it('has job polling intervals', () => {
    expect(PERFORMANCE.JOB_POLL_FAST_MS).toBe(1_000);
    expect(PERFORMANCE.JOB_POLL_MEDIUM_MS).toBe(3_000);
    expect(PERFORMANCE.JOB_POLL_SLOW_MS).toBe(5_000);
  });

  it('has chunk size and sample rows', () => {
    expect(PERFORMANCE.CHUNK_SIZE_ROWS).toBe(500);
    expect(PERFORMANCE.AI_SAMPLE_ROWS).toBe(5);
  });
});
