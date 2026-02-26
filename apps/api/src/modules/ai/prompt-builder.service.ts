import { Injectable } from '@nestjs/common';
import type { AIContext, SheetBlueprint, ColumnStats } from '@excelflow/shared';
import { SUPPORTED_FORMULA_FUNCTIONS, VOLATILE_FUNCTIONS } from '@excelflow/shared';

@Injectable()
export class PromptBuilderService {
  /**
   * Builds the system prompt for spreadsheet editing.
   * Uses SheetBlueprint for precise context so AI writes correct formulas.
   */
  buildEditSystemPrompt(context: AIContext): string {
    const sheetsDesc = context.sheets.map((s) => {
      const blueprint = s.blueprint;
      const colMapStr = blueprint
        ? blueprint.columnMap
            .map((c) => {
              let desc = `    ${c.letter}: "${c.header}" (${c.type})`;
              if (c.uniqueValues && c.uniqueValues.length > 0) {
                desc += ` [values: ${c.uniqueValues.map((v) => `"${v}"`).join(', ')}]`;
              }
              if (c.numberFormat && c.numberFormat !== 'general') {
                desc += ` [format: ${c.numberFormat}]`;
              }
              return desc;
            })
            .join('\n')
        : s.headers.map((h, i) => `    ${h} (${s.columnTypes[i]})`).join('\n');

      const rangeInfo = blueprint
        ? `Data rows: ${blueprint.dataStartRow} to ${blueprint.dataEndRow} (${blueprint.totalDataRows} rows)`
        : `Range: ${s.usedRange}, ${s.rowCount} data rows`;

      const mergeInfo = blueprint?.hasMerges
        ? `\n    Merged cells: ${blueprint.mergeRanges.join(', ')}`
        : '';

      const formulaRef = blueprint
        ? `\n    Formula sheet reference: ${blueprint.escapedSheetName}`
        : '';

      return `  Sheet "${s.name}" (id: "${s.id}"):\n` +
        `    ${rangeInfo}${formulaRef}${mergeInfo}\n` +
        `    Columns:\n${colMapStr}`;
    }).join('\n\n');

    // Build data table for sheets with sample rows
    const dataSection = this.buildDataSection(context);

    // Pre-compute aggregations so AI doesn't need to count rows
    const aggregations = this.buildAggregationsSection(context);

    const existingSheets = context.existingSheetNames
      ? `\nExisting sheet names: ${context.existingSheetNames.map((n) => `"${n}"`).join(', ')}`
      : '';

    return `You are an AI assistant for ExcelFlow, a spreadsheet application.
You help users edit their spreadsheets using natural language commands.
You are AUTONOMOUS — do NOT ask for clarification unless the request is truly impossible to interpret.
When in doubt, make the best decision and explain what you did.

WORKBOOK CONTEXT:
${sheetsDesc}
${aggregations}
${dataSection}
Active sheet: "${context.activeSheet}"
${context.selectedRange ? `Selected range: ${context.selectedRange}` : ''}
Classification: ${context.classification}${existingSheets}

${this.buildActionReference()}

${this.buildFormulaRules(context)}

${this.buildDataIntegrityRules()}

${this.buildAutonomyRules()}

${this.buildResponseFormat()}`;
  }

  /**
   * Builds the system prompt for Quick Summary generation.
   * Uses blueprint for precise column mapping and formula references.
   */
  buildSummarySystemPrompt(
    context: AIContext,
    selectedColumns?: string[],
    crossTabData?: string,
    sourceSheetName?: string,
    columnLetterMap?: Record<string, string>,
  ): string {
    const sheet = context.sheets[0];
    if (!sheet) return 'No sheet data available.';
    const blueprint = sheet.blueprint;

    const colDesc = blueprint
      ? blueprint.columnMap.map((c) => {
          const stat = sheet.stats.find((st) => st.header === c.header);
          let detail = `  ${c.letter}: "${c.header}" (${c.type}`;
          if (stat) detail += `, ${stat.count} rows, ${stat.missing} missing, ${stat.unique} unique`;
          detail += ')';
          if (stat?.type === 'numeric' && stat.min !== undefined) {
            detail += ` [min=${stat.min}, max=${stat.max}, avg=${stat.mean?.toFixed(2)}, sum=${stat.sum}]`;
          }
          if (c.uniqueValues && c.uniqueValues.length > 0) {
            detail += ` [ALL values: ${c.uniqueValues.map((v) => `"${v}"`).join(', ')}]`;
          }
          return detail;
        }).join('\n')
      : sheet.stats.map((st) => `  - "${st.header}" (${st.type})`).join('\n');

    const srcSheet = sourceSheetName ?? sheet.name;
    const escaped = blueprint?.escapedSheetName ?? `'${srcSheet}'`;
    const lastDataRow = blueprint?.dataEndRow ?? (sheet.rowCount + 1);

    const colMapDesc = blueprint
      ? blueprint.columnMap.map((c) => `  "${c.header}" → column ${c.letter}`).join('\n')
      : columnLetterMap
        ? Object.entries(columnLetterMap).map(([h, l]) => `  "${h}" → column ${l}`).join('\n')
        : '';

    const categoryColumns = sheet.stats.filter(
      (st) => st.type === 'category' && st.topValues && st.topValues.length > 0,
    );
    const numericColumns = sheet.stats.filter((st) => st.type === 'numeric');

    const columnFilter = selectedColumns && selectedColumns.length > 0
      ? `\nUSER SELECTED COLUMNS: ${selectedColumns.join(', ')}\nFocus on these columns.`
      : '\nNo specific columns selected — produce a FULL comprehensive summary.';

    const crossTabSection = crossTabData
      ? `\nPRE-COMPUTED CROSS-TABULATION DATA (use EXACT numbers for verification — write FORMULAS, not static values):\n${crossTabData}`
      : '';

    return `You are an expert data analyst AI generating a comprehensive Quick Summary.
Your job is to produce a COMPLETE, ACCURATE, multi-section summary as a new sheet using LIVE FORMULAS.
You are AUTONOMOUS — never ask for clarification. Analyze the data and produce the best summary.

SOURCE SHEET: "${srcSheet}" (${blueprint?.totalDataRows ?? sheet.rowCount} data rows, last data row = ${lastDataRow})
FORMULA SHEET REFERENCE: ${escaped}

COLUMN LETTER MAPPING (EXACT — use these letters in formulas):
${colMapDesc}

COLUMNS:
${colDesc}
${columnFilter}

CATEGORY COLUMNS: ${categoryColumns.map((c) => `"${c.header}"`).join(', ') || 'none'}
NUMERIC COLUMNS: ${numericColumns.map((c) => `"${c.header}"`).join(', ') || 'none'}
${crossTabSection}

${this.buildFormulaInstructions(escaped, lastDataRow)}

${this.buildSummaryStructure()}

${this.buildSummaryResponseFormat()}`;
  }

  private buildActionReference(): string {
    return `AVAILABLE ACTIONS:
- SET_CELL: { type: "SET_CELL", sheetId: string, cellRef: "A1", value: string|number|boolean|null, formula?: "=SUM(A1:A10)" }
- SET_RANGE: { type: "SET_RANGE", sheetId: string, range: { startRow, endRow, startCol, endCol }, values: [][] }
- FORMAT_CELLS: { type: "FORMAT_CELLS", sheetId: string, range: { startRow, endRow, startCol, endCol }, format: { bold?, italic?, fontSize?, fontColor?, bgColor?, numberFormat?, alignment? } }
- INSERT_ROWS/DELETE_ROWS: { type: "INSERT_ROWS", sheetId: string, startRow: number, count: number }
- INSERT_COLS/DELETE_COLS: { type: "INSERT_COLS", sheetId: string, startCol: number, count: number }
- SORT_RANGE: { type: "SORT_RANGE", sheetId: string, range: {...}, column: number, direction: "asc"|"desc" }
- CREATE_SHEET: { type: "CREATE_SHEET", name: string }
- DELETE_SHEET: { type: "DELETE_SHEET", sheetId: string }
- RENAME_SHEET: { type: "RENAME_SHEET", sheetId: string, name: string }
- MERGE_CELLS/UNMERGE_CELLS: { type: "MERGE_CELLS", sheetId: string, range: {...} }

INDEXING RULES:
- Row/col indices are 0-based in range objects. Row 0 = header row.
- cellRef uses Excel notation: "A1" = col 0, row 0.
- When creating a new sheet, use the sheet NAME as sheetId for subsequent actions.
- Sheet names are limited to 31 characters. Keep new sheet names SHORT (e.g., "Performance Ranking", "Backlog Summary").`;
  }

  private buildFormulaRules(context: AIContext): string {
    const funcList = SUPPORTED_FORMULA_FUNCTIONS.join(', ');
    const volatileList = VOLATILE_FUNCTIONS.join(', ');

    return `FORMULA RULES:
- Use Excel formula syntax: =SUM(), =COUNTIFS(), etc.
- ONLY use these supported functions: ${funcList}
- NEVER use volatile functions: ${volatileList} (unless user explicitly requests them)
- For cross-sheet formulas, use the EXACT escaped sheet name from the blueprint.
- When writing SET_CELL with a formula, set value to null and use the "formula" field.
- Prefer formulas over static values — formulas stay live when source data changes.
- For category criteria in COUNTIFS/SUMIFS, use the EXACT unique values from the column mapping.`;
  }

  private buildAutonomyRules(): string {
    return `AUTONOMY RULES (CRITICAL):
- NEVER ask for clarification unless the request is truly impossible to understand.
- If column names are ambiguous, pick the most likely match and explain your choice.
- If the user says "summarize" or "analyze", produce a comprehensive result immediately.
- If the user says "fix" or "correct", read the data, identify issues, and fix them.
- If you create computed results, ALWAYS create a NEW sheet (never overwrite source data).
- After making changes, briefly explain what you did and why.
- If a sheet name you want to create already exists, append a number: "Summary (2)", etc.`;
  }

  private buildResponseFormat(): string {
    return `RESPONSE FORMAT (always valid JSON):
{
  "message": "Human-readable explanation — MUST be detailed and complete. Include all numbers, rankings, tables, and reasoning. Do NOT say 'here are the results' without listing them. The message IS the answer.",
  "plan": ["Step 1", "Step 2"],
  "actions": [ ...action objects... ],
  "requiresConfirmation": false,
  "estimatedImpact": {
    "cellsAffected": number,
    "sheetsAffected": ["sheet names"],
    "createsNewSheet": boolean,
    "overwritesData": boolean
  }
}

CRITICAL MESSAGE RULES:
- The "message" field must contain the COMPLETE answer. Never truncate or summarize.
- For analytical questions: include a full ranked list/table with computed values for EVERY row.
- For "top N" questions: show ALL items ranked, then highlight the top N.
- Use markdown formatting (tables, bold, lists) in the message for readability.
- If only answering a question with no spreadsheet changes: { "message": "Your full answer here", "actions": [] }
- For threshold/optimization questions: include a cumulative progress table with columns: Step, Item, Gain, Cumulative Total, Cumulative %.
- ALWAYS verify your final answer by checking the math at the critical step. State the exact fraction and percentage.
- NEVER say "approximately" or "close to" for threshold questions — compute the EXACT value and state whether it crosses the threshold or not.

TOKEN EFFICIENCY (CRITICAL — prevents response truncation):
- Use SET_RANGE with 2D value arrays instead of many individual SET_CELL actions when setting multiple consecutive cells.
- Batch FORMAT_CELLS into wide ranges instead of per-cell formatting.
- Keep total actions under 200 to stay within token limits.`;
  }

  /**
   * Build a readable data table from sample rows so AI can analyze actual values.
   * For small datasets (≤100 rows), ALL rows are included.
   */
  private buildDataSection(context: AIContext): string {
    const sections: string[] = [];
    for (const sheet of context.sheets) {
      if (sheet.sampleRows.length === 0) continue;
      const isFullData = sheet.sampleRows.length >= sheet.rowCount;
      const label = isFullData
        ? `FULL DATA for "${sheet.name}" (${sheet.sampleRows.length} rows)`
        : `SAMPLE DATA for "${sheet.name}" (${sheet.sampleRows.length} of ${sheet.rowCount} rows)`;
      const headerRow = sheet.headers.join(' | ');
      const dataRows = sheet.sampleRows
        .map((row) => (row as unknown[]).map((v) => v ?? '').join(' | '))
        .join('\n');
      sections.push(`\n${label}:\n${headerRow}\n${dataRows}`);
    }
    return sections.length > 0 ? sections.join('\n') : '';
  }

  /**
   * Pre-compute aggregations server-side so the AI never needs to count rows.
   * Includes frequency tables for category columns and cross-tabulations.
   */
  private buildAggregationsSection(context: AIContext): string {
    const sections: string[] = [];

    for (const sheet of context.sheets) {
      const categoryStats = sheet.stats.filter(
        (st) => st.type === 'category' && st.topValues && st.topValues.length > 0,
      );
      if (categoryStats.length === 0) continue;

      sections.push(`\nPRE-COMPUTED AGGREGATIONS for "${sheet.name}" (EXACT — use these numbers, do NOT count rows yourself):`);

      for (const stat of categoryStats) {
        const total = stat.topValues!.reduce((sum, tv) => sum + tv.count, 0);
        sections.push(`\n  "${stat.header}" frequency (${stat.unique} unique values, ${total} total):`);
        for (const tv of stat.topValues!) {
          const pct = ((tv.count / total) * 100).toFixed(1);
          sections.push(`    "${tv.value}": ${tv.count} (${pct}%)`);
        }
      }

      // Build cross-tabulations between category columns
      const crossTabs = this.buildCrossTabAggregations(sheet, categoryStats);
      if (crossTabs) {
        sections.push(crossTabs);
      }

      // Build pre-ranked performance tables
      const ranked = this.buildRankedPerformanceTables(sheet, categoryStats);
      if (ranked) {
        sections.push(ranked);
      }
    }

    return sections.join('\n');
  }

  /**
   * Build cross-tabulation tables between category columns.
   * E.g., unit_name × geo_status → count per combination.
   */
  private buildCrossTabAggregations(
    sheet: AIContext['sheets'][number],
    categoryStats: ColumnStats[],
  ): string | null {
    if (categoryStats.length < 2 || sheet.sampleRows.length === 0) return null;
    // Only cross-tab if we have full data
    if (sheet.sampleRows.length < sheet.rowCount) return null;

    const sections: string[] = [];
    const headers = sheet.headers;

    // For each pair of category columns, build a cross-tab
    for (let i = 0; i < categoryStats.length; i++) {
      for (let j = i + 1; j < categoryStats.length; j++) {
        const colA = categoryStats[i]!;
        const colB = categoryStats[j]!;
        // Skip if too many unique values (would be too large)
        if ((colA.unique ?? 0) > 30 || (colB.unique ?? 0) > 30) continue;

        const colAIdx = headers.indexOf(colA.header);
        const colBIdx = headers.indexOf(colB.header);
        if (colAIdx === -1 || colBIdx === -1) continue;

        // Count occurrences of each (A, B) pair
        const counts = new Map<string, number>();
        for (const row of sheet.sampleRows) {
          const r = row as unknown[];
          const a = String(r[colAIdx] ?? '');
          const b = String(r[colBIdx] ?? '');
          if (!a || !b) continue;
          const key = `${a}|||${b}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        // Format as a table
        const aValues = colA.topValues!.map((tv) => tv.value);
        const bValues = colB.topValues!.map((tv) => tv.value);

        sections.push(`\n  Cross-tab: "${colA.header}" × "${colB.header}":`);
        const headerLine = `    ${''.padEnd(25)} | ${bValues.map((v) => v.padEnd(12)).join(' | ')} | Total`;
        sections.push(headerLine);

        for (const aVal of aValues) {
          let rowTotal = 0;
          const cells: string[] = [];
          for (const bVal of bValues) {
            const c = counts.get(`${aVal}|||${bVal}`) ?? 0;
            rowTotal += c;
            cells.push(String(c).padEnd(12));
          }
          sections.push(`    ${aVal.padEnd(25)} | ${cells.join(' | ')} | ${rowTotal}`);
        }

        // Grand total row
        const grandCells: string[] = [];
        let grandTotal = 0;
        for (const bVal of bValues) {
          let colTotal = 0;
          for (const aVal of aValues) {
            colTotal += counts.get(`${aVal}|||${bVal}`) ?? 0;
          }
          grandCells.push(String(colTotal).padEnd(12));
          grandTotal += colTotal;
        }
        sections.push(`    ${'TOTAL'.padEnd(25)} | ${grandCells.join(' | ')} | ${grandTotal}`);
      }
    }

    return sections.length > 0 ? sections.join('\n') : null;
  }

  /**
   * Build pre-ranked performance tables from cross-tab data.
   * Detects status columns (2-5 unique values) vs grouping columns (more unique values),
   * then emits a fully sorted, ranked table the AI can copy directly.
   */
  private buildRankedPerformanceTables(
    sheet: AIContext['sheets'][number],
    categoryStats: ColumnStats[],
  ): string | null {
    if (categoryStats.length < 2 || sheet.sampleRows.length === 0) return null;
    if (sheet.sampleRows.length < sheet.rowCount) return null;

    const headers = sheet.headers;
    // Find status columns (2-5 unique) and grouping columns (>5 unique)
    const statusCols = categoryStats.filter((s) => (s.unique ?? 0) >= 2 && (s.unique ?? 0) <= 5);
    const groupCols = categoryStats.filter((s) => (s.unique ?? 0) > 5 && (s.unique ?? 0) <= 30);
    if (statusCols.length === 0 || groupCols.length === 0) return null;

    const sections: string[] = [];

    for (const statusCol of statusCols) {
      for (const groupCol of groupCols) {
        const sIdx = headers.indexOf(statusCol.header);
        const gIdx = headers.indexOf(groupCol.header);
        if (sIdx === -1 || gIdx === -1) continue;

        const statusValues = statusCol.topValues!.map((tv) => tv.value);
        // Count per (group, status) pair
        const data = new Map<string, Map<string, number>>();
        const groupTotals = new Map<string, number>();
        for (const row of sheet.sampleRows) {
          const r = row as unknown[];
          const g = String(r[gIdx] ?? '');
          const s = String(r[sIdx] ?? '');
          if (!g || !s) continue;
          if (!data.has(g)) data.set(g, new Map());
          data.get(g)!.set(s, (data.get(g)!.get(s) ?? 0) + 1);
          groupTotals.set(g, (groupTotals.get(g) ?? 0) + 1);
        }

        const grandTotal = [...groupTotals.values()].reduce((a, b) => a + b, 0);
        // Determine the "negative" status for backlog (the one to sort by DESC)
        // Heuristic: pick the status with fewer total occurrences as the "positive"
        const statusTotals = statusValues.map((sv) => {
          let c = 0;
          for (const m of data.values()) c += m.get(sv) ?? 0;
          return { value: sv, count: c };
        });
        statusTotals.sort((a, b) => a.count - b.count);
        // The status with MORE items is the "backlog" to rank by
        const backlogStatus = statusTotals[statusTotals.length - 1]!.value;
        const totalBacklog = statusTotals[statusTotals.length - 1]!.count;

        // Build rows with all metrics
        interface RankedRow { group: string; total: number; statusCounts: Record<string, number>; backlog: number; pct: string; blPct: string }
        const rows: RankedRow[] = [];
        for (const [group, total] of groupTotals.entries()) {
          const sc: Record<string, number> = {};
          for (const sv of statusValues) sc[sv] = data.get(group)?.get(sv) ?? 0;
          const backlog = sc[backlogStatus] ?? 0;
          const posCount = total - backlog;
          rows.push({
            group, total, statusCounts: sc, backlog,
            pct: ((posCount / total) * 100).toFixed(1) + '%',
            blPct: ((backlog / totalBacklog) * 100).toFixed(1) + '%',
          });
        }
        // Sort by backlog DESC, then by group name ASC for ties
        rows.sort((a, b) => b.backlog - a.backlog || a.group.localeCompare(b.group));

        // Format the table
        const statusHeaders = statusValues.join(' | ');
        const positiveLabel = statusValues.find((v) => v !== backlogStatus) ?? statusValues[0]!;
        sections.push(`\n  PRE-RANKED PERFORMANCE TABLE ("${groupCol.header}" by "${statusCol.header}", sorted by ${backlogStatus} count DESC):`);
        sections.push(`  Rank | ${groupCol.header} | Total | ${statusHeaders} | ${positiveLabel}% | Backlog%`);
        rows.forEach((r, i) => {
          const svCells = statusValues.map((sv) => String(r.statusCounts[sv] ?? 0));
          sections.push(`  ${i + 1} | ${r.group} | ${r.total} | ${svCells.join(' | ')} | ${r.pct} | ${r.blPct}`);
        });
        sections.push(`  TOTALS: ${grandTotal} rows, ${backlogStatus}=${totalBacklog}, Backlog rate=${((totalBacklog / grandTotal) * 100).toFixed(1)}%`);
      }
    }

    return sections.length > 0 ? sections.join('\n') : null;
  }

  private buildDataIntegrityRules(): string {
    return `DATA INTEGRITY RULES (CRITICAL — NEVER VIOLATE):
- NEVER fabricate, invent, or hallucinate data values. Use ONLY the actual data provided above.
- NEVER use placeholder data like "Unit 1", "Unit 2" or round numbers like 50, 100.
- If you only have SAMPLE DATA (not full), state that your analysis is based on a sample.

PRE-COMPUTED AGGREGATION RULES (CRITICAL):
- The PRE-COMPUTED AGGREGATIONS contain EXACT counts computed server-side. These are GROUND TRUTH.
- ALWAYS use pre-computed frequency counts, cross-tab numbers, and ranked tables. NEVER count rows yourself.
- For any analytical question (totals, percentages, rankings), derive from PRE-COMPUTED AGGREGATIONS only.
- The raw data rows are for reference and identifying specific records, NOT for counting.

PRE-RANKED TABLE RULES (CRITICAL — for ranking, comparison, and performance questions):
- If a PRE-RANKED PERFORMANCE TABLE exists, use it DIRECTLY for any ranking or comparison question.
- Copy the rank numbers, sort order, and all metrics EXACTLY as shown in the pre-ranked table.
- When creating a comparison sheet, the ROW ORDER must match the pre-ranked table order.
- NEVER re-sort or re-rank the data yourself — the pre-ranked table is already correctly sorted.
- For "top N backlog" questions, take the first N rows from the pre-ranked table.

OPTIMIZATION & THRESHOLD QUESTION RULES:
- "Fully optimize a unit" = tag ALL remaining untagged. GAIN = untagged count.
- To minimize units: use the pre-ranked table order (already sorted by backlog DESC).
- Build a CUMULATIVE PROGRESS TABLE from the pre-ranked order.
- NEVER approximate. Compute EXACT values and state whether threshold is crossed.`;
  }

  private buildFormulaInstructions(
    escaped: string,
    lastDataRow: number,
  ): string {
    return `FORMULA INSTRUCTIONS (CRITICAL — use LIVE FORMULAS, not static numbers):
- Count category: =COUNTIFS(${escaped}!X:X,"VALUE")
- Cross-tab count: =COUNTIFS(${escaped}!X:X,"V1",${escaped}!Y:Y,"V2")
- Sum with criteria: =SUMIFS(${escaped}!V:V,${escaped}!X:X,"VALUE")
- Total non-empty: =COUNTA(${escaped}!X2:X${lastDataRow})
- Grand Total row: =SUM(B3:B10) (reference summary sheet cells)

When writing SET_CELL with formula:
{ "type": "SET_CELL", "sheetId": "__SUMMARY__", "cellRef": "B3", "value": null, "formula": "=COUNTIFS(${escaped}!B:B,\\"TAGGED\\")" }

FORMULA RULES:
- value MUST be null when using a formula.
- Escape double quotes inside formulas with backslash: \\"VALUE\\"
- Use EXACT column letters from COLUMN LETTER MAPPING.
- Category criteria must match EXACT values from the column data.
- ONLY use supported functions: ${SUPPORTED_FORMULA_FUNCTIONS.slice(0, 20).join(', ')}, etc.
- NEVER use volatile functions: ${VOLATILE_FUNCTIONS.join(', ')}`;
  }

  private buildSummaryStructure(): string {
    return `SUMMARY STRUCTURE — produce these sections IN ORDER:

SECTION 1: "Overall Summary"
- Title row: "Overall Summary" (bold, fontSize 14)
- For each category column: unique value labels in col A, COUNTIFS formula in col B
- For each numeric column: Count, Sum, Average, Min, Max
- Layout: Column A = label, Column B = formula

SECTION 2+: Cross-Tabulation Sections
- Title: table title (bold, fontSize 12)
- Header row: grouping name, then one column per primary value, last = "Total"
- Data cells: COUNTIFS formulas with TWO criteria
- Total column: =SUM() of the row's data cells
- Grand Total row: =SUM() of each column's data cells

FORMATTING:
- Section titles: bold, fontSize 14 for main, 12 for sub-sections
- Table headers: bold, bgColor "#E8E8E8"
- Numbers: right-aligned
- One empty row between sections
- Use FORMAT_CELLS with wide ranges, not per-cell`;
  }

  private buildSummaryResponseFormat(): string {
    return `RESPONSE FORMAT (valid JSON):
{
  "message": "Summary description",
  "summarySheetName": "Summary",
  "actions": [
    { "type": "SET_CELL", "sheetId": "__SUMMARY__", "cellRef": "A1", "value": "Overall Summary" },
    ...
  ]
}

RULES:
- sheetId must be "__SUMMARY__" for all actions.
- Row/col indices are 0-based. A1 = row 0, col 0.
- FORMAT_CELLS range: { startRow, endRow, startCol, endCol } (0-based integers).
- FORMAT_CELLS format: { bold, italic, fontSize, fontColor, bgColor, alignment } (flat keys).
- Use FORMULAS, not static numbers.
- Include ALL unique values — never truncate.
- Every cross-tab MUST have a Grand Total row.
- Keep total actions under 500.

TOKEN EFFICIENCY (CRITICAL — prevents response truncation):
- Use SET_RANGE with 2D value arrays instead of many individual SET_CELL actions when setting consecutive cells.
- Batch FORMAT_CELLS into wide ranges instead of per-cell formatting.
- Keep total actions under 200 to avoid hitting token limits.
- If the summary would require more than 200 actions, reduce granularity (fewer cross-tabs, combine sections).`;
  }
}
