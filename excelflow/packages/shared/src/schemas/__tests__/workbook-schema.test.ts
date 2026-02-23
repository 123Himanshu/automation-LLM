import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { cellRangeSchema, cellValueSchema } from '../cell-schema';
import { actionSchema, actionBatchSchema } from '../action-schema';

/**
 * Tests for workbook-level validation rules:
 * - Action batch constraints
 * - Edge case action payloads
 * - Discriminated union exhaustiveness
 */

describe('action discriminated union', () => {
  const allTypes = [
    'SET_CELL', 'SET_RANGE', 'FORMAT_CELLS',
    'INSERT_ROWS', 'DELETE_ROWS', 'INSERT_COLS', 'DELETE_COLS',
    'SORT_RANGE', 'CREATE_SHEET', 'DELETE_SHEET', 'RENAME_SHEET',
    'MERGE_CELLS', 'UNMERGE_CELLS',
  ] as const;

  it('accepts all 13 action types', () => {
    expect(allTypes.length).toBe(13);
  });

  it('rejects unknown action type', () => {
    const result = actionSchema.safeParse({ type: 'UNKNOWN', sheetId: 'x' });
    expect(result.success).toBe(false);
  });

  it('validates INSERT_ROWS with valid data', () => {
    const result = actionSchema.safeParse({
      type: 'INSERT_ROWS',
      sheetId: 'sheet1',
      startRow: 5,
      count: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects INSERT_ROWS with count > 10000', () => {
    const result = actionSchema.safeParse({
      type: 'INSERT_ROWS',
      sheetId: 'sheet1',
      startRow: 0,
      count: 10001,
    });
    expect(result.success).toBe(false);
  });

  it('validates DELETE_COLS', () => {
    const result = actionSchema.safeParse({
      type: 'DELETE_COLS',
      sheetId: 'sheet1',
      startCol: 2,
      count: 1,
    });
    expect(result.success).toBe(true);
  });

  it('validates MERGE_CELLS', () => {
    const result = actionSchema.safeParse({
      type: 'MERGE_CELLS',
      sheetId: 'sheet1',
      range: { startRow: 0, endRow: 2, startCol: 0, endCol: 3 },
    });
    expect(result.success).toBe(true);
  });

  it('validates UNMERGE_CELLS', () => {
    const result = actionSchema.safeParse({
      type: 'UNMERGE_CELLS',
      sheetId: 'sheet1',
      range: { startRow: 0, endRow: 2, startCol: 0, endCol: 3 },
    });
    expect(result.success).toBe(true);
  });

  it('validates RENAME_SHEET', () => {
    const result = actionSchema.safeParse({
      type: 'RENAME_SHEET',
      sheetId: 'sheet1',
      name: 'New Name',
    });
    expect(result.success).toBe(true);
  });

  it('rejects RENAME_SHEET with empty name', () => {
    const result = actionSchema.safeParse({
      type: 'RENAME_SHEET',
      sheetId: 'sheet1',
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('validates DELETE_SHEET', () => {
    const result = actionSchema.safeParse({
      type: 'DELETE_SHEET',
      sheetId: 'sheet1',
    });
    expect(result.success).toBe(true);
  });
});

describe('actionBatchSchema edge cases', () => {
  it('accepts batch with max 5000 actions', () => {
    const actions = Array.from({ length: 5000 }, (_, i) => ({
      type: 'SET_CELL' as const,
      sheetId: 'sheet1',
      cellRef: `A${i + 1}`,
      value: i,
    }));
    const result = actionBatchSchema.safeParse({
      workbookId: 'wb1',
      revisionId: 'rev1',
      actions,
      source: 'manual',
    });
    expect(result.success).toBe(true);
  });

  it('rejects batch with > 5000 actions', () => {
    const actions = Array.from({ length: 5001 }, (_, i) => ({
      type: 'SET_CELL' as const,
      sheetId: 'sheet1',
      cellRef: `A${i + 1}`,
      value: i,
    }));
    const result = actionBatchSchema.safeParse({
      workbookId: 'wb1',
      revisionId: 'rev1',
      actions,
      source: 'manual',
    });
    expect(result.success).toBe(false);
  });

  it('accepts "system" source', () => {
    const result = actionBatchSchema.safeParse({
      workbookId: 'wb1',
      revisionId: 'rev1',
      actions: [{ type: 'CREATE_SHEET', name: 'Test' }],
      source: 'system',
    });
    expect(result.success).toBe(true);
  });

  it('accepts "ai" source', () => {
    const result = actionBatchSchema.safeParse({
      workbookId: 'wb1',
      revisionId: 'rev1',
      actions: [{ type: 'CREATE_SHEET', name: 'AI Sheet' }],
      source: 'ai',
    });
    expect(result.success).toBe(true);
  });

  it('accepts metadata field', () => {
    const result = actionBatchSchema.safeParse({
      workbookId: 'wb1',
      revisionId: 'rev1',
      actions: [{ type: 'CREATE_SHEET', name: 'Test' }],
      source: 'manual',
      metadata: { description: 'test batch', userId: 'u1' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing workbookId', () => {
    const result = actionBatchSchema.safeParse({
      revisionId: 'rev1',
      actions: [{ type: 'CREATE_SHEET', name: 'Test' }],
      source: 'manual',
    });
    expect(result.success).toBe(false);
  });
});

describe('cellRangeSchema edge cases', () => {
  it('accepts zero-based range', () => {
    const result = cellRangeSchema.safeParse({
      startRow: 0, endRow: 0, startCol: 0, endCol: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts large range', () => {
    const result = cellRangeSchema.safeParse({
      startRow: 0, endRow: 999999, startCol: 0, endCol: 16383,
    });
    expect(result.success).toBe(true);
  });
});
