import { describe, it, expect } from 'vitest';
import {
  workbookMetaSchema,
  sheetSummarySchema,
  sheetDataSchema,
  actionResultSchema,
  revisionMetaSchema,
  chatMessageSchema,
  exportResultSchema,
  jobStatusSchema,
  createWorkbookResultSchema,
  workbookMetaResponseSchema,
} from '../response-schema';

describe('workbookMetaSchema', () => {
  it('accepts valid workbook meta', () => {
    const result = workbookMetaSchema.safeParse({
      id: 'abc123',
      name: 'Test',
      classification: 'normal',
      sheetCount: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid classification', () => {
    const result = workbookMetaSchema.safeParse({
      id: 'abc', name: 'Test', classification: 'huge',
      sheetCount: 1, createdAt: 'x', updatedAt: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing sheetCount', () => {
    const result = workbookMetaSchema.safeParse({
      id: 'abc', name: 'Test', classification: 'normal',
      createdAt: 'x', updatedAt: 'x',
    });
    expect(result.success).toBe(false);
  });
});

describe('sheetSummarySchema', () => {
  it('accepts valid sheet summary', () => {
    const result = sheetSummarySchema.safeParse({
      id: 's1', name: 'Sheet1',
      usedRange: { startRow: 0, startCol: 0, endRow: 10, endCol: 5 },
    });
    expect(result.success).toBe(true);
  });
});

describe('sheetDataSchema', () => {
  it('accepts valid sheet data with cells', () => {
    const result = sheetDataSchema.safeParse({
      id: 's1', name: 'Sheet1',
      cells: {
        A1: { value: 'hello', type: 'string' },
        B1: { value: 42, type: 'number', formula: '=SUM(A1:A10)', computedValue: 42 },
      },
      merges: [],
      columnWidths: {},
      rowHeights: {},
      frozenRows: 0, frozenCols: 0,
      usedRange: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts cell with format', () => {
    const result = sheetDataSchema.safeParse({
      id: 's1', name: 'Sheet1',
      cells: {
        A1: {
          value: 'bold', type: 'string',
          format: { bold: true, bgColor: '#FF0000' },
        },
      },
      merges: [], columnWidths: {}, rowHeights: {},
      frozenRows: 0, frozenCols: 0,
      usedRange: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid cell type', () => {
    const result = sheetDataSchema.safeParse({
      id: 's1', name: 'Sheet1',
      cells: { A1: { value: 'x', type: 'invalid_type' } },
      merges: [], columnWidths: {}, rowHeights: {},
      frozenRows: 0, frozenCols: 0,
      usedRange: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
    });
    expect(result.success).toBe(false);
  });
});

describe('actionResultSchema', () => {
  it('accepts valid action result', () => {
    const result = actionResultSchema.safeParse({
      revisionId: 'rev1', version: 3,
      changedCells: { sheet1: { A1: 42, B1: 'hello' } },
      warnings: ['Large paste'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty changedCells', () => {
    const result = actionResultSchema.safeParse({
      revisionId: 'rev1', version: 0, changedCells: {}, warnings: [],
    });
    expect(result.success).toBe(true);
  });
});

describe('revisionMetaSchema', () => {
  it('accepts valid revision', () => {
    const result = revisionMetaSchema.safeParse({
      id: 'r1', version: 5, source: 'manual', createdAt: '2026-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts ai source with description', () => {
    const result = revisionMetaSchema.safeParse({
      id: 'r2', version: 6, source: 'ai',
      description: 'AI generated summary', createdAt: '2026-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid source', () => {
    const result = revisionMetaSchema.safeParse({
      id: 'r1', version: 1, source: 'unknown', createdAt: 'x',
    });
    expect(result.success).toBe(false);
  });
});

describe('chatMessageSchema', () => {
  it('accepts valid assistant message', () => {
    const result = chatMessageSchema.safeParse({
      id: 'm1', role: 'assistant', content: 'Hello!',
      timestamp: '2026-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('exportResultSchema', () => {
  it('accepts sync export', () => {
    const result = exportResultSchema.safeParse({
      downloadUrl: '/api/exports/test.xlsx', isAsync: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts async export', () => {
    const result = exportResultSchema.safeParse({
      jobId: 'job1', isAsync: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('jobStatusSchema', () => {
  it('accepts completed job', () => {
    const result = jobStatusSchema.safeParse({
      id: 'j1', type: 'export_xlsx', status: 'completed',
      progress: 100, result: { downloadUrl: '/test.xlsx' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts failed job', () => {
    const result = jobStatusSchema.safeParse({
      id: 'j2', type: 'export_pdf', status: 'failed',
      progress: 50, error: 'Timeout',
    });
    expect(result.success).toBe(true);
  });
});

describe('createWorkbookResultSchema', () => {
  it('accepts valid create result', () => {
    const result = createWorkbookResultSchema.safeParse({
      id: 'wb1', name: 'New Workbook', classification: 'normal',
      sheetCount: 1, revisionId: 'R0',
    });
    expect(result.success).toBe(true);
  });
});

describe('apiResponse wrapper', () => {
  it('wraps workbook meta in success envelope', () => {
    const result = workbookMetaResponseSchema.safeParse({
      success: true,
      data: {
        id: 'abc', name: 'Test', classification: 'large',
        sheetCount: 3, createdAt: 'x', updatedAt: 'x',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects when success is false', () => {
    const result = workbookMetaResponseSchema.safeParse({
      success: false,
      data: { id: 'abc', name: 'Test', classification: 'normal',
        sheetCount: 1, createdAt: 'x', updatedAt: 'x' },
    });
    expect(result.success).toBe(false);
  });
});
