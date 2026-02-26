import type { Sheet } from '@excelflow/shared';
import { colIndexToLetter } from '@excelflow/shared';

/**
 * Builds a smart summary prompt from the active sheet's data.
 * Analyzes headers, row count, column types, and sample values
 * to generate a detailed, editable prompt for the AI.
 */
export function buildSummaryPrompt(sheet: Sheet): string {
  const { cells, usedRange, name } = sheet;
  const rowCount = usedRange.endRow;
  const colCount = usedRange.endCol + 1;

  // Extract headers (row 1)
  const headers: string[] = [];
  for (let c = 0; c <= usedRange.endCol; c++) {
    const letter = colIndexToLetter(c);
    const cell = cells[`${letter}1`];
    const val = cell?.computedValue ?? cell?.value;
    headers.push(val != null ? String(val) : `Column ${letter}`);
  }

  // Detect column types from first 20 data rows
  const columnInfo = headers.map((header, colIdx) => {
    const letter = colIndexToLetter(colIdx);
    let numCount = 0;
    let emptyCount = 0;
    const sampleValues: string[] = [];
    const maxSample = Math.min(rowCount, 20);

    for (let r = 2; r <= maxSample + 1; r++) {
      const cell = cells[`${letter}${r}`];
      const val = cell?.computedValue ?? cell?.value;
      if (val === null || val === undefined || val === '') {
        emptyCount++;
        continue;
      }
      if (typeof val === 'number') numCount++;
      if (sampleValues.length < 3 && !sampleValues.includes(String(val))) {
        sampleValues.push(String(val).slice(0, 30));
      }
    }

    const checked = maxSample - emptyCount;
    const type = checked === 0 ? 'empty' : numCount / checked > 0.7 ? 'numeric' : 'text/category';

    return { header, type, sampleValues };
  });

  const numericCols = columnInfo.filter((c) => c.type === 'numeric').map((c) => c.header);
  const textCols = columnInfo.filter((c) => c.type === 'text/category').map((c) => c.header);

  // Build the prompt
  const parts: string[] = [
    `Analyze the sheet "${name}" (${rowCount} rows × ${colCount} columns) and generate a comprehensive summary.`,
    '',
    `Headers: ${headers.join(', ')}`,
  ];

  if (numericCols.length > 0) {
    parts.push(`Numeric columns: ${numericCols.join(', ')} — calculate sum, average, min, max, and distribution.`);
  }
  if (textCols.length > 0) {
    parts.push(`Category columns: ${textCols.join(', ')} — show unique counts, top values, and frequency breakdown.`);
  }

  parts.push('');
  parts.push('Create a new "Summary" sheet with:');
  parts.push('1. Key statistics for each column (count, missing %, unique values)');
  parts.push('2. Numeric breakdowns (sum, avg, min, max) using formulas where possible');
  parts.push('3. Top category distributions');
  parts.push('4. Any notable patterns or data quality issues');

  return parts.join('\n');
}
