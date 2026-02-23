import { describe, it, expect } from 'vitest';
import { cellValueSchema, cellRangeSchema, cellFormatSchema } from '../cell-schema';

describe('cellValueSchema', () => {
  it('accepts string', () => {
    expect(cellValueSchema.safeParse('hello').success).toBe(true);
  });

  it('accepts number', () => {
    expect(cellValueSchema.safeParse(42).success).toBe(true);
    expect(cellValueSchema.safeParse(3.14).success).toBe(true);
  });

  it('accepts boolean', () => {
    expect(cellValueSchema.safeParse(true).success).toBe(true);
  });

  it('accepts null', () => {
    expect(cellValueSchema.safeParse(null).success).toBe(true);
  });

  it('rejects undefined', () => {
    expect(cellValueSchema.safeParse(undefined).success).toBe(false);
  });

  it('rejects objects', () => {
    expect(cellValueSchema.safeParse({}).success).toBe(false);
    expect(cellValueSchema.safeParse([]).success).toBe(false);
  });
});

describe('cellRangeSchema', () => {
  it('accepts valid range', () => {
    const result = cellRangeSchema.safeParse({
      startRow: 0, startCol: 0, endRow: 10, endCol: 5,
    });
    expect(result.success).toBe(true);
  });

  it('accepts single-cell range', () => {
    const result = cellRangeSchema.safeParse({
      startRow: 5, startCol: 3, endRow: 5, endCol: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects endRow < startRow', () => {
    const result = cellRangeSchema.safeParse({
      startRow: 10, startCol: 0, endRow: 5, endCol: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects endCol < startCol', () => {
    const result = cellRangeSchema.safeParse({
      startRow: 0, startCol: 5, endRow: 10, endCol: 3,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative values', () => {
    const result = cellRangeSchema.safeParse({
      startRow: -1, startCol: 0, endRow: 10, endCol: 5,
    });
    expect(result.success).toBe(false);
  });
});

describe('cellFormatSchema', () => {
  it('accepts valid format', () => {
    const result = cellFormatSchema.safeParse({
      bold: true,
      italic: false,
      fontSize: 14,
      fontColor: '#FF0000',
      bgColor: '#00FF00',
      alignment: 'center',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty format', () => {
    expect(cellFormatSchema.safeParse({}).success).toBe(true);
  });

  it('rejects invalid hex color', () => {
    expect(cellFormatSchema.safeParse({ fontColor: 'red' }).success).toBe(false);
    expect(cellFormatSchema.safeParse({ fontColor: '#FFF' }).success).toBe(false);
  });

  it('rejects fontSize out of range', () => {
    expect(cellFormatSchema.safeParse({ fontSize: 5 }).success).toBe(false);
    expect(cellFormatSchema.safeParse({ fontSize: 73 }).success).toBe(false);
  });

  it('rejects invalid alignment', () => {
    expect(cellFormatSchema.safeParse({ alignment: 'justify' }).success).toBe(false);
  });

  it('rejects unknown properties (strict)', () => {
    expect(cellFormatSchema.safeParse({ unknown: true }).success).toBe(false);
  });
});
