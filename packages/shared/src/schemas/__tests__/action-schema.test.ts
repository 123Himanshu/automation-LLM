import { describe, it, expect } from 'vitest';
import { actionSchema, actionBatchSchema } from '../action-schema';

describe('actionSchema', () => {
  describe('SET_CELL', () => {
    it('accepts valid SET_CELL', () => {
      const result = actionSchema.safeParse({
        type: 'SET_CELL',
        sheetId: 'sheet1',
        cellRef: 'A1',
        value: 42,
      });
      expect(result.success).toBe(true);
    });

    it('accepts SET_CELL with formula', () => {
      const result = actionSchema.safeParse({
        type: 'SET_CELL',
        sheetId: 'sheet1',
        cellRef: 'B2',
        value: null,
        formula: '=SUM(A1:A10)',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid cellRef', () => {
      const result = actionSchema.safeParse({
        type: 'SET_CELL',
        sheetId: 'sheet1',
        cellRef: '1A',
        value: 42,
      });
      expect(result.success).toBe(false);
    });

    it('rejects formula not starting with =', () => {
      const result = actionSchema.safeParse({
        type: 'SET_CELL',
        sheetId: 'sheet1',
        cellRef: 'A1',
        value: null,
        formula: 'SUM(A1:A10)',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty sheetId', () => {
      const result = actionSchema.safeParse({
        type: 'SET_CELL',
        sheetId: '',
        cellRef: 'A1',
        value: 42,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('SET_RANGE', () => {
    it('accepts valid SET_RANGE', () => {
      const result = actionSchema.safeParse({
        type: 'SET_RANGE',
        sheetId: 'sheet1',
        range: { startRow: 0, startCol: 0, endRow: 2, endCol: 2 },
        values: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid range (end < start)', () => {
      const result = actionSchema.safeParse({
        type: 'SET_RANGE',
        sheetId: 'sheet1',
        range: { startRow: 5, startCol: 0, endRow: 2, endCol: 2 },
        values: [[1]],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('FORMAT_CELLS', () => {
    it('accepts valid format', () => {
      const result = actionSchema.safeParse({
        type: 'FORMAT_CELLS',
        sheetId: 'sheet1',
        range: { startRow: 0, startCol: 0, endRow: 0, endCol: 3 },
        format: { bold: true, bgColor: '#FF0000' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid color format', () => {
      const result = actionSchema.safeParse({
        type: 'FORMAT_CELLS',
        sheetId: 'sheet1',
        range: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        format: { bgColor: 'red' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('CREATE_SHEET', () => {
    it('accepts valid name', () => {
      const result = actionSchema.safeParse({ type: 'CREATE_SHEET', name: 'Sheet2' });
      expect(result.success).toBe(true);
    });

    it('rejects empty name', () => {
      const result = actionSchema.safeParse({ type: 'CREATE_SHEET', name: '' });
      expect(result.success).toBe(false);
    });

    it('rejects name > 31 chars', () => {
      const result = actionSchema.safeParse({ type: 'CREATE_SHEET', name: 'A'.repeat(32) });
      expect(result.success).toBe(false);
    });
  });

  describe('SORT_RANGE', () => {
    it('accepts valid sort', () => {
      const result = actionSchema.safeParse({
        type: 'SORT_RANGE',
        sheetId: 's1',
        range: { startRow: 0, startCol: 0, endRow: 10, endCol: 5 },
        column: 2,
        direction: 'asc',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid direction', () => {
      const result = actionSchema.safeParse({
        type: 'SORT_RANGE',
        sheetId: 's1',
        range: { startRow: 0, startCol: 0, endRow: 10, endCol: 5 },
        column: 2,
        direction: 'up',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('actionBatchSchema', () => {
  it('accepts valid batch', () => {
    const result = actionBatchSchema.safeParse({
      workbookId: 'wb1',
      revisionId: 'rev1',
      actions: [{ type: 'SET_CELL', sheetId: 's1', cellRef: 'A1', value: 1 }],
      source: 'manual',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty actions array', () => {
    const result = actionBatchSchema.safeParse({
      workbookId: 'wb1',
      revisionId: 'rev1',
      actions: [],
      source: 'manual',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid source', () => {
    const result = actionBatchSchema.safeParse({
      workbookId: 'wb1',
      revisionId: 'rev1',
      actions: [{ type: 'SET_CELL', sheetId: 's1', cellRef: 'A1', value: 1 }],
      source: 'unknown',
    });
    expect(result.success).toBe(false);
  });
});
