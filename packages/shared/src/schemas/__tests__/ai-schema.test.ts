import { describe, it, expect } from 'vitest';
import {
  aiPromptBodySchema,
  summaryRequestBodySchema,
} from '../ai-schema';

describe('aiPromptBodySchema', () => {
  it('accepts valid prompt', () => {
    const result = aiPromptBodySchema.safeParse({
      message: 'Sum column B',
      activeSheet: 'sheet1',
    });
    expect(result.success).toBe(true);
  });

  it('accepts with optional selectedRange', () => {
    const result = aiPromptBodySchema.safeParse({
      message: 'Format as currency',
      activeSheet: 'sheet1',
      selectedRange: 'A1:B10',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty message', () => {
    const result = aiPromptBodySchema.safeParse({
      message: '',
      activeSheet: 'sheet1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing activeSheet', () => {
    const result = aiPromptBodySchema.safeParse({
      message: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects message > 10000 chars', () => {
    const result = aiPromptBodySchema.safeParse({
      message: 'x'.repeat(10001),
      activeSheet: 'sheet1',
    });
    expect(result.success).toBe(false);
  });
});

describe('summaryRequestBodySchema', () => {
  it('accepts valid request with defaults', () => {
    const result = summaryRequestBodySchema.safeParse({
      scope: 'all_sheets',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outputLocation).toBe('new_sheet');
      expect(result.data.depth).toBe('basic');
      expect(result.data.autoExport).toBe('none');
    }
  });

  it('accepts all scope values', () => {
    for (const scope of ['selection', 'active_sheet', 'all_sheets'] as const) {
      expect(summaryRequestBodySchema.safeParse({ scope }).success).toBe(true);
    }
  });

  it('accepts explicit options', () => {
    const result = summaryRequestBodySchema.safeParse({
      scope: 'active_sheet',
      outputLocation: 'same_sheet',
      depth: 'detailed',
      autoExport: 'xlsx',
      activeSheet: 'Sheet1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid scope', () => {
    const result = summaryRequestBodySchema.safeParse({
      scope: 'everything',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid autoExport', () => {
    const result = summaryRequestBodySchema.safeParse({
      scope: 'all_sheets',
      autoExport: 'csv',
    });
    expect(result.success).toBe(false);
  });
});
