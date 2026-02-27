/** Formula functions supported by HyperFormula that the AI is allowed to use */
export const SUPPORTED_FORMULA_FUNCTIONS = [
  // Math
  'SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'COUNTA', 'COUNTBLANK',
  'ABS', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'CEILING', 'FLOOR',
  'MOD', 'POWER', 'SQRT', 'INT',
  // Conditional counting/summing
  'IF', 'IFS', 'IFERROR', 'IFNA',
  'COUNTIF', 'COUNTIFS', 'SUMIF', 'SUMIFS',
  'AVERAGEIF', 'AVERAGEIFS',
  // Lookup
  'VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH',
  // Text
  'CONCATENATE', 'CONCAT', 'TEXTJOIN', 'LEFT', 'RIGHT', 'MID',
  'LEN', 'TRIM', 'UPPER', 'LOWER', 'PROPER', 'SUBSTITUTE',
  'TEXT', 'VALUE', 'FIND', 'SEARCH',
  // Date
  'DATE', 'YEAR', 'MONTH', 'DAY', 'DATEVALUE',
  // Logical
  'AND', 'OR', 'NOT', 'TRUE', 'FALSE',
  // Statistical
  'MEDIAN', 'MODE', 'STDEV', 'VAR', 'LARGE', 'SMALL',
  'PERCENTILE', 'RANK',
] as const;

/** Volatile functions that recalculate on every change — banned by default */
export const VOLATILE_FUNCTIONS = [
  'NOW', 'TODAY', 'RAND', 'RANDBETWEEN', 'OFFSET', 'INDIRECT',
] as const;

/** Extract function names from a formula string */
export function extractFormulaFunctions(formula: string): string[] {
  if (!formula.startsWith('=')) return [];
  // Match word characters followed by opening paren: SUM(, COUNTIFS(, etc.
  const matches = formula.match(/[A-Z][A-Z0-9]*(?=\s*\()/gi);
  return matches ? [...new Set(matches.map((m) => m.toUpperCase()))] : [];
}

/** Check if a formula contains only supported functions */
export function validateFormulaFunctions(formula: string): {
  valid: boolean;
  unsupported: string[];
  volatile: string[];
} {
  const functions = extractFormulaFunctions(formula);
  const supportedSet = new Set<string>(SUPPORTED_FORMULA_FUNCTIONS);
  const volatileSet = new Set<string>(VOLATILE_FUNCTIONS);

  const unsupported = functions.filter(
    (f) => !supportedSet.has(f) && !volatileSet.has(f),
  );
  const volatile = functions.filter((f) => volatileSet.has(f));

  return {
    valid: unsupported.length === 0,
    unsupported,
    volatile,
  };
}
