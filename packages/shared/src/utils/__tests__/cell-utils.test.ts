import { describe, it, expect } from 'vitest';
import {
  colIndexToLetter,
  letterToColIndex,
  parseCellRef,
  buildCellRef,
  isDateValue,
  sanitizeSheetName,
} from '../cell-utils';

describe('colIndexToLetter', () => {
  it('converts single-letter columns', () => {
    expect(colIndexToLetter(0)).toBe('A');
    expect(colIndexToLetter(25)).toBe('Z');
  });

  it('converts double-letter columns', () => {
    expect(colIndexToLetter(26)).toBe('AA');
    expect(colIndexToLetter(27)).toBe('AB');
    expect(colIndexToLetter(51)).toBe('AZ');
    expect(colIndexToLetter(52)).toBe('BA');
    expect(colIndexToLetter(701)).toBe('ZZ');
  });

  it('converts triple-letter columns', () => {
    expect(colIndexToLetter(702)).toBe('AAA');
  });
});

describe('letterToColIndex', () => {
  it('converts single letters', () => {
    expect(letterToColIndex('A')).toBe(0);
    expect(letterToColIndex('Z')).toBe(25);
  });

  it('converts double letters', () => {
    expect(letterToColIndex('AA')).toBe(26);
    expect(letterToColIndex('AZ')).toBe(51);
    expect(letterToColIndex('BA')).toBe(52);
    expect(letterToColIndex('ZZ')).toBe(701);
  });

  it('round-trips with colIndexToLetter', () => {
    for (let i = 0; i < 100; i++) {
      expect(letterToColIndex(colIndexToLetter(i))).toBe(i);
    }
  });
});

describe('parseCellRef', () => {
  it('parses simple refs', () => {
    expect(parseCellRef('A1')).toEqual({ col: 0, row: 0 });
    expect(parseCellRef('B2')).toEqual({ col: 1, row: 1 });
    expect(parseCellRef('Z100')).toEqual({ col: 25, row: 99 });
  });

  it('parses multi-letter refs', () => {
    expect(parseCellRef('AA1')).toEqual({ col: 26, row: 0 });
    expect(parseCellRef('AZ50')).toEqual({ col: 51, row: 49 });
  });

  it('throws on invalid refs', () => {
    expect(() => parseCellRef('')).toThrow('Invalid cell reference');
    expect(() => parseCellRef('1A')).toThrow('Invalid cell reference');
    expect(() => parseCellRef('a1')).toThrow('Invalid cell reference');
  });
});

describe('buildCellRef', () => {
  it('builds refs from indices', () => {
    expect(buildCellRef(0, 0)).toBe('A1');
    expect(buildCellRef(1, 1)).toBe('B2');
    expect(buildCellRef(26, 0)).toBe('AA1');
  });

  it('round-trips with parseCellRef', () => {
    const refs = ['A1', 'B2', 'Z100', 'AA1', 'AZ50'];
    for (const ref of refs) {
      const { col, row } = parseCellRef(ref);
      expect(buildCellRef(col, row)).toBe(ref);
    }
  });
});

describe('isDateValue', () => {
  it('detects Excel serial dates', () => {
    expect(isDateValue(1)).toBe(true);
    expect(isDateValue(44000)).toBe(true);
    expect(isDateValue(0)).toBe(false);
    expect(isDateValue(200000)).toBe(false);
  });

  it('detects date strings', () => {
    expect(isDateValue('2024-01-15')).toBe(true);
    expect(isDateValue('Jan 15, 2024')).toBe(true);
    expect(isDateValue('not a date')).toBe(false);
  });

  it('rejects non-date types', () => {
    expect(isDateValue(null)).toBe(false);
    expect(isDateValue(true)).toBe(false);
  });
});

describe('sanitizeSheetName', () => {
  it('removes invalid characters', () => {
    expect(sanitizeSheetName('Sheet/1')).toBe('Sheet_1');
    expect(sanitizeSheetName('Test[2]')).toBe('Test_2_');
  });

  it('truncates to 31 chars', () => {
    const long = 'A'.repeat(50);
    expect(sanitizeSheetName(long).length).toBe(31);
  });

  it('returns "Sheet" for empty input', () => {
    expect(sanitizeSheetName('')).toBe('Sheet');
  });
});
