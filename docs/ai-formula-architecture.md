# ExcelFlow AI Formula Architecture — Final Design

## Problem Statement

The AI assistant produces incorrect results because:
1. It receives incomplete context (sample rows, not full data)
2. It guesses column letters, sheet names, and category values
3. It writes static values instead of live formulas
4. It doesn't self-correct effectively when errors occur
5. It asks for clarification instead of acting autonomously

This architecture eliminates ALL 15 identified failure modes by giving the AI
precise structural metadata so it writes correct formulas every time, and by
adding validation + closed-loop audit to catch the remaining edge cases.

---

## Architecture Overview

```
User Prompt
    │
    ▼
┌─────────────────────────────────────────────────┐
│  LAYER 1: ENRICHED CONTEXT BUILDER              │
│                                                  │
│  Builds a "Sheet Blueprint" with:                │
│  ┌────────────────────────────────────────────┐  │
│  │ • Column Letter Map (header → letter)      │  │  ← Fixes Problem 1
│  │ • Escaped Sheet Name (with quotes if needed)│  │  ← Fixes Problem 2
│  │ • Exact Unique Values per category column  │  │  ← Fixes Problem 3
│  │ • Data Range (startRow, endRow)            │  │  ← Fixes Problem 5
│  │ • Merge Info (ranges with merge cells)     │  │  ← Fixes Problem 6
│  │ • Existing Sheet Names (taken names)       │  │  ← Fixes Problem 7
│  │ • Cross-Sheet Dependencies (formula refs)  │  │  ← Fixes Problem 8
│  │ • Number Formats per column                │  │  ← Fixes Problem 15
│  │ • Supported Formula Functions list         │  │  ← Fixes Problem 10
│  └────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  LAYER 2: HARDENED PROMPT BUILDER               │
│                                                  │
│  System prompt includes:                         │
│  • Precise column map (not just headers)         │
│  • Formula function whitelist                    │  ← Fixes Problem 10
│  • Volatile function ban                         │  ← Fixes Problem 14
│  • "Never ask for clarification" directive       │  ← Fixes AI passivity
│  • SET_RANGE for bulk, SET_CELL for formulas     │  ← Fixes Problem 9
│  • Sheet name escaping rules                     │
│  • Cross-sheet formula syntax examples           │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  LAYER 3: PRE-EXECUTION VALIDATOR               │
│                                                  │
│  Before applying ANY action:                     │
│  • Formula syntax check (starts with =)          │
│  • Function whitelist check                      │  ← Fixes Problem 10
│  • Volatile function detection + warning         │  ← Fixes Problem 14
│  • Circular reference pre-check                  │  ← Fixes Problem 11
│  • Cross-sheet dependency check for DELETE_SHEET │  ← Fixes Problem 8
│  • Action batch size limit (max 1000)            │  ← Fixes Problem 9
│  • Sheet name conflict resolution                │  ← Fixes Problem 7
│  • Auto-correct range dimensions                 │  (already exists)
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  LAYER 4: ACTION ENGINE                         │
│  (existing — no changes needed)                  │
│                                                  │
│  validate → apply → recalc → revision            │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  LAYER 5: CLOSED-LOOP AUDIT                     │
│                                                  │
│  After actions applied:                          │
│  1. Read back all AI-written cells               │
│  2. Check for #REF!, #NAME?, #VALUE!, etc.       │
│  3. If errors found:                             │
│     a. Feed errors + cell refs back to LLM       │  ← Fixes Problem 12
│     b. LLM returns corrective actions            │
│     c. Apply corrections (max 2 retries)         │
│  4. If still broken → report to user with detail │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  LAYER 6: CONCURRENCY GUARD                     │
│                                                  │
│  • Per-workbook mutex for AI operations          │  ← Fixes Problem 13
│  • Queue second request until first completes    │
│  • Revision optimistic concurrency (existing)    │
└─────────────────────────────────────────────────┘
```

---

## Detailed Component Design

### 1. Sheet Blueprint (New Interface)

```typescript
interface SheetBlueprint {
  sheetId: string;
  sheetName: string;
  escapedSheetName: string;        // e.g., "'My Sheet'", "'Data (2)'"
  dataStartRow: number;            // typically 2 (row after headers)
  dataEndRow: number;              // last row with data
  totalDataRows: number;
  columnMap: ColumnMapping[];       // ordered list of columns
  mergeRanges: string[];           // e.g., ["A1:C1", "D5:D10"]
  hasMerges: boolean;
}

interface ColumnMapping {
  letter: string;                  // "A", "B", "C", etc.
  header: string;                  // "geo_status", "project_manager"
  type: ColumnType;                // "numeric", "category", "text", "date"
  uniqueValues?: string[];         // for category columns — ALL unique values
  numberFormat?: string;           // "percentage", "currency", "decimal", etc.
  sampleValues?: CellValue[];      // 3-5 sample values for non-category columns
}
```

### 2. Enriched Context Builder Changes

Current `AIContext.sheets[n]` has: `headers`, `columnTypes`, `stats`, `sampleRows`.

New additions to each sheet context:
- `blueprint: SheetBlueprint` — the precise structural map
- `existingSheetNames: string[]` — all sheet names in the workbook (for conflict avoidance)

The context builder will:
1. Extract ALL unique values for category columns (not just top 5)
2. Build the column letter → header mapping
3. Detect number formats from cell format metadata
4. Escape sheet names that contain spaces/special chars
5. Scan for merge ranges
6. Compute exact data range boundaries

### 3. Formula Function Whitelist

```typescript
const SUPPORTED_FORMULA_FUNCTIONS = [
  // Math
  'SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'COUNTA', 'COUNTBLANK',
  'ABS', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'CEILING', 'FLOOR',
  'MOD', 'POWER', 'SQRT', 'INT',
  // Conditional
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

const VOLATILE_FUNCTIONS = [
  'NOW', 'TODAY', 'RAND', 'RANDBETWEEN', 'OFFSET', 'INDIRECT',
] as const;
```

### 4. Pre-Execution Formula Validator (New)

Added to `ActionValidatorService`:

```
For each SET_CELL action with a formula:
  1. Extract function names from formula using regex
  2. Check each function against whitelist → warn if unknown
  3. Check for volatile functions → warn (block unless user explicitly asked)
  4. Check for circular self-reference (formula refs its own cell)
  5. Validate sheet name references exist

For DELETE_SHEET actions:
  1. Scan ALL other sheets for formulas referencing the target sheet
  2. If found → add error: "Cannot delete sheet X: Y formulas in Z sheets reference it"
```

### 5. Closed-Loop Audit Enhancement

Current audit: scan → find errors → try to fix formula syntax → apply corrections.

Enhanced audit:
```
Pass 1: Scan for errors (existing)
  ↓
If errors found AND corrections possible locally → apply (existing)
  ↓
Pass 2: Re-scan
  ↓
If STILL errors → NEW: Feed errors back to LLM
  - Send: "These cells have errors: A5=#REF! (formula: =COUNTIFS(...)), B10=#NAME?"
  - LLM returns corrective actions
  - Apply corrective actions
  ↓
Pass 3: Final scan
  ↓
If STILL errors → report to user with specific cell refs and error types
```

### 6. Concurrency Guard

```typescript
// Simple per-workbook mutex using a Map<workbookId, Promise>
class AIConcurrencyGuard {
  private locks = new Map<string, Promise<void>>();

  async acquire(workbookId: string): Promise<() => void> {
    while (this.locks.has(workbookId)) {
      await this.locks.get(workbookId);
    }
    let release: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    this.locks.set(workbookId, promise);
    return () => {
      this.locks.delete(workbookId);
      release!();
    };
  }
}
```

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `packages/shared/src/constants/formula-whitelist.ts` | Supported + volatile function lists |
| `packages/shared/src/types/blueprint-types.ts` | SheetBlueprint, ColumnMapping interfaces |
| `apps/api/src/modules/ai/concurrency-guard.service.ts` | Per-workbook AI mutex |

### Modified Files
| File | Changes |
|------|---------|
| `packages/shared/src/types/ai-types.ts` | Add `blueprint` field to AIContext sheet |
| `packages/shared/src/index.ts` | Export new types and constants |
| `apps/api/src/modules/ai/context-builder.service.ts` | Build SheetBlueprint with full column map, unique values, formats, merges |
| `apps/api/src/modules/ai/prompt-builder.service.ts` | Use blueprint in prompts, add function whitelist, add autonomy directives |
| `apps/api/src/modules/ai/ai.service.ts` | Add concurrency guard, use enriched context |
| `apps/api/src/modules/ai/ai-audit.service.ts` | Add LLM-powered correction pass (closed loop) |
| `apps/api/src/modules/ai/ai.module.ts` | Register ConcurrencyGuardService |
| `apps/api/src/modules/action/action-validator.service.ts` | Add formula function validation, volatile detection, delete-sheet dependency check |

---

## Problem → Solution Traceability

| # | Problem | Solution Layer | Mechanism |
|---|---------|---------------|-----------|
| 1 | Wrong column letter | Context Builder | Explicit `columnMap: [{letter:"B", header:"geo_status"}]` |
| 2 | Wrong sheet name | Context Builder | `escapedSheetName` with auto-quoting |
| 3 | Case mismatch in values | Context Builder | Exact `uniqueValues` from normalized data |
| 4 | Dirty data | XLSX Parser | Already fixed — normalizeString() |
| 5 | Data range off-by-one | Context Builder | Explicit `dataStartRow`, `dataEndRow` |
| 6 | Merged cells | Context Builder | `mergeRanges` + `hasMerges` flag in blueprint |
| 7 | Sheet name conflicts | Context Builder + Validator | `existingSheetNames` + CREATE_SHEET validation |
| 8 | Delete sheet with deps | Validator | Cross-sheet formula dependency scan |
| 9 | Too many actions | Prompt Builder + Validator | Batch size limit + SET_RANGE preference |
| 10 | Invalid formula function | Prompt + Validator | Whitelist in prompt + validation check |
| 11 | Circular references | Validator | Pre-check before apply |
| 12 | Audit doesn't self-correct | Audit Service | LLM-powered correction pass |
| 13 | Concurrent AI requests | Concurrency Guard | Per-workbook mutex |
| 14 | Volatile functions | Prompt + Validator | Ban in prompt + detection in validator |
| 15 | Number format mismatch | Context Builder | `numberFormat` per column in blueprint |
