/**
 * Convert column index (0-based) to Excel letter(s): 0→A, 25→Z, 26→AA
 */
export function colIndexToLetter(index: number): string {
  let result = '';
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

/**
 * Convert Excel column letter(s) to 0-based index: A→0, Z→25, AA→26
 */
export function letterToColIndex(letter: string): number {
  let result = 0;
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 64);
  }
  return result - 1;
}

/**
 * Parse cell reference like "A1" into { col: 0, row: 0 }
 */
export function parseCellRef(ref: string): { col: number; row: number } {
  const match = ref.match(/^([A-Z]{1,3})(\d{1,7})$/);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid cell reference: ${ref}`);
  }
  return {
    col: letterToColIndex(match[1]),
    row: parseInt(match[2], 10) - 1,
  };
}

/**
 * Build cell reference from col/row indices: (0, 0) → "A1"
 */
export function buildCellRef(col: number, row: number): string {
  return `${colIndexToLetter(col)}${row + 1}`;
}

/**
 * Check if a string looks like a date value
 */
export function isDateValue(value: unknown): boolean {
  if (typeof value === 'number') {
    // Excel serial date range (1900-01-01 to ~2200)
    return value >= 1 && value <= 109574;
  }
  if (typeof value === 'string') {
    const d = Date.parse(value);
    return !isNaN(d);
  }
  return false;
}

/**
 * Sanitize sheet name: remove invalid characters, limit length
 */
export function sanitizeSheetName(name: string): string {
  return name
    .replace(/[\\/*?[\]:]/g, '_')
    .slice(0, 31)
    .trim() || 'Sheet';
}
