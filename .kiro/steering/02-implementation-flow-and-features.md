---
inclusion: always
---

# ExcelFlow — Implementation Flow & Feature Guide

This steering document defines HOW to implement every feature, the exact data flow pipelines, edge case handling, and the order of implementation. Read this before writing any feature code.

## 1. Implementation Order (Strict Phases)

### Phase 1: Foundation
1. Monorepo setup (Turborepo + workspaces)
2. Shared package (Zod schemas, types, constants)
3. Backend bootstrap (NestJS + Fastify + Neon DB + Prisma)
4. Frontend bootstrap (Next.js + Tailwind + shadcn/ui)
5. Basic Auth middleware
6. File upload endpoint + storage
7. XLSX parser → canonical workbook model

### Phase 2: Core Spreadsheet
1. AG Grid integration with HyperFormula
2. Workbook editor page (grid + formula bar + sheet tabs)
3. Action engine (validate → apply → recalc → revision)
4. Manual edit pipeline (cell edit, paste, fill, format)
5. Multi-sheet support + cross-sheet formulas
6. Revision system (create, list, revert)

### Phase 3: Performance & Classification
1. Workbook classification engine (Normal/Large/Heavy)
2. Virtualization for large sheets
3. Progressive recalculation modes
4. Async job runner
5. Manual calc mode toggle for heavy workbooks

### Phase 4: AI Assistant
1. AI chat panel UI
2. Context builder (headers, types, stats, sample rows)
3. Intent classification
4. Clarification gate
5. Plan + Preview system
6. Tool call execution through action engine
7. AI safety guardrails

### Phase 5: Quick Summary
1. Summary modal UI
2. Column type auto-detection
3. Metric computation engine
4. Summary sheet writer
5. Auto-export trigger

### Phase 6: Export
1. XLSX export (formulas + values + formatting)
2. PDF export (Playwright + print settings)
3. Revision-pinned exports
4. Background job for heavy exports

### Phase 7: Polish
1. Undo/redo UI
2. Error boundaries + toast system
3. Loading states + skeleton screens
4. File cleanup cron
5. Final edge case hardening

## 2. Canonical Workbook Model

This is the single source of truth. The UI grid is a VIEW of this model, never the source.

```typescript
// packages/shared/src/types/workbook-types.ts

interface Workbook {
  id: string;
  name: string;
  sheets: Sheet[];
  classification: WorkbookClassification;
  createdAt: string;
  updatedAt: string;
}

interface Sheet {
  id: string;
  name: string;
  cells: Record<string, Cell>;  // key = "A1", "B2", etc.
  merges: MergeRange[];
  columnWidths: Record<number, number>;
  rowHeights: Record<number, number>;
  frozenRows: number;
  frozenCols: number;
  usedRange: CellRange;
}

interface Cell {
  value: CellValue;           // raw value (string | number | boolean | null)
  formula?: string;           // e.g., "=SUM(A1:A10)"
  computedValue?: CellValue;  // result after formula evaluation
  format?: CellFormat;
  type: CellType;             // 'string' | 'number' | 'boolean' | 'date' | 'formula' | 'empty'
}

type CellValue = string | number | boolean | null;

interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  fontColor?: string;
  bgColor?: string;
  numberFormat?: string;
  alignment?: 'left' | 'center' | 'right';
  border?: BorderConfig;
}

type WorkbookClassification = 'normal' | 'large' | 'heavy';
```

## 3. Action Engine Pipeline

EVERY change (manual or AI) flows through this exact pipeline:

```
User/AI Edit
    ↓
[1] Create Action Batch
    ↓
[2] Validate Actions
    - Range bounds check
    - Merge constraint check
    - Formula syntax validation
    - Type mismatch warnings
    - Overwrite permission check
    ↓
[3] Apply to Workbook Model
    - Update cells in canonical model
    - Update HyperFormula instance
    ↓
[4] Recalculate
    - Normal: full dependency recalc (sync)
    - Large: targeted dependency recalc
    - Heavy: incremental recalc (possibly async)
    ↓
[5] Save Revision
    - Create revision record in DB
    - Store action log
    - Return new revision ID
    ↓
[6] Return Diffs
    - Changed cells with new values
    - New revision ID
    - Warnings (if any)
```

### Action Types (Discriminated Union)

```typescript
type Action =
  | { type: 'SET_CELL'; sheetId: string; cellRef: string; value: CellValue; formula?: string }
  | { type: 'SET_RANGE'; sheetId: string; range: CellRange; values: CellValue[][] }
  | { type: 'FORMAT_CELLS'; sheetId: string; range: CellRange; format: Partial<CellFormat> }
  | { type: 'INSERT_ROWS'; sheetId: string; startRow: number; count: number }
  | { type: 'DELETE_ROWS'; sheetId: string; startRow: number; count: number }
  | { type: 'INSERT_COLS'; sheetId: string; startCol: number; count: number }
  | { type: 'DELETE_COLS'; sheetId: string; startCol: number; count: number }
  | { type: 'SORT_RANGE'; sheetId: string; range: CellRange; column: number; direction: 'asc' | 'desc' }
  | { type: 'CREATE_SHEET'; name: string }
  | { type: 'DELETE_SHEET'; sheetId: string }
  | { type: 'RENAME_SHEET'; sheetId: string; name: string }
  | { type: 'MERGE_CELLS'; sheetId: string; range: CellRange }
  | { type: 'UNMERGE_CELLS'; sheetId: string; range: CellRange };

interface ActionBatch {
  workbookId: string;
  revisionId: string;  // current revision (optimistic concurrency)
  actions: Action[];
  source: 'manual' | 'ai';
  metadata?: Record<string, unknown>;
}
```

## 4. Workbook Classification Logic

```typescript
function classifyWorkbook(metrics: WorkbookMetrics): WorkbookClassification {
  const { usedCells, formulaCount, volatileCount, sheetCount, crossSheetDeps, maxColumns } = metrics;

  if (
    usedCells > 2_000_000 ||
    (crossSheetDeps > 1000 && formulaCount > 200_000) ||
    volatileCount > 500
  ) {
    return 'heavy';
  }

  if (
    usedCells > 500_000 ||
    formulaCount > 100_000 ||
    maxColumns > 200 ||
    volatileCount > 50
  ) {
    return 'large';
  }

  return 'normal';
}
```

### Classification Effects

| Feature | Normal | Large | Heavy |
|---|---|---|---|
| Recalc mode | Auto (sync) | Targeted | Incremental/Manual |
| Virtualization | Row only | Row + Column | Row + Column + Chunked loading |
| AI context | Full headers + stats | Headers + stats + sampling | Headers + aggregated stats only |
| Paste limit | Unlimited | 50k cells async | 10k cells async |
| Sort | Sync | Async | Async + progress |
| Export | Sync | Background job | Background job |

## 5. Revision System

### Database Schema (Prisma)

```prisma
model Workbook {
  id             String     @id @default(cuid())
  name           String
  classification String     @default("normal")
  filePath       String
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  revisions      Revision[]
}

model Revision {
  id          String   @id @default(cuid())
  workbookId  String
  workbook    Workbook @relation(fields: [workbookId], references: [id])
  version     Int
  actions     Json     // ActionBatch serialized
  snapshot    Json?    // Optional full state snapshot (every N revisions)
  source      String   // 'manual' | 'ai' | 'system'
  description String?
  createdAt   DateTime @default(now())

  @@unique([workbookId, version])
  @@index([workbookId, createdAt])
}

model Job {
  id          String   @id @default(cuid())
  workbookId  String
  type        String   // 'export_xlsx' | 'export_pdf' | 'sort' | 'ai_operation'
  status      String   @default("pending") // 'pending' | 'running' | 'completed' | 'failed'
  progress    Int      @default(0)
  result      Json?
  error       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### Revision Rules
- Every action batch creates exactly one revision.
- Snapshot full state every 50 revisions for fast restore.
- Revert = apply inverse actions as new revision (never delete history).
- Exports are always pinned to a specific revision ID.
- Concurrent edit conflict: reject if `revisionId` doesn't match current head.

## 6. AI Assistant Implementation

### Context Builder (CRITICAL — never dump full data)

```typescript
interface AIContext {
  workbookId: string;
  sheets: Array<{
    name: string;
    usedRange: string;        // e.g., "A1:Z1000"
    headers: string[];
    columnTypes: string[];    // 'numeric' | 'text' | 'date' | 'category' | 'mixed'
    stats: ColumnStats[];
    sampleRows: unknown[][];  // max 5 rows
    rowCount: number;
  }>;
  activeSheet: string;
  selectedRange?: string;
  classification: WorkbookClassification;
}
```

### AI Safety Rules
1. AI NEVER directly mutates the workbook model.
2. AI returns structured tool calls (Action[] format).
3. Tool calls go through the SAME action engine as manual edits.
4. High-impact operations (>1000 cells affected) require plan + preview.
5. Default behavior: create new sheet for output (never overwrite).
6. AI must request clarification when:
   - Scope is ambiguous
   - Column names are unclear
   - Operation could destroy data
7. Large workbook mode: AI uses sampling, not full row access.

### AI Tool Call Format

```typescript
interface AIToolCall {
  tool: 'apply_actions';
  plan: string[];           // human-readable plan bullets
  actions: Action[];
  estimatedImpact: {
    cellsAffected: number;
    sheetsAffected: string[];
    createsNewSheet: boolean;
    overwritesData: boolean;
  };
  requiresConfirmation: boolean;
}
```

## 7. Quick Summary Engine

### Column Type Detection

```typescript
function detectColumnType(values: CellValue[]): ColumnType {
  const nonEmpty = values.filter(v => v !== null && v !== '');
  if (nonEmpty.length === 0) return 'empty';

  const numericCount = nonEmpty.filter(v => typeof v === 'number').length;
  const dateCount = nonEmpty.filter(v => isDateValue(v)).length;

  if (numericCount / nonEmpty.length > 0.8) return 'numeric';
  if (dateCount / nonEmpty.length > 0.8) return 'date';

  const uniqueRatio = new Set(nonEmpty.map(String)).size / nonEmpty.length;
  if (uniqueRatio < 0.3) return 'category';

  return 'text';
}
```

### Summary Metrics by Type

| Column Type | Metrics |
|---|---|
| Numeric | count, sum, avg, min, max, missing%, std dev |
| Date | count, min, max, range, missing% |
| Category | count, unique count, top 5 values with counts, missing% |
| Text | count, avg length, missing%, unique count |

### Summary Output Rules
- Default: write to new sheet named "Summary"
- If "Summary" exists: "Summary (2)", "Summary (3)", etc.
- Clean formatting: headers bold, numbers right-aligned, alternating row colors
- Add formulas where possible (SUM, AVERAGE, etc.) so values stay live
- Large mode: use aggregation, not row-by-row iteration
- Heavy mode: sample-based estimates with confidence indicators

## 8. Export Implementation

### XLSX Export
- Use `exceljs` library for serialization.
- Preserve: formulas, values, formatting, column widths, merged cells, sheet names.
- Always export from a specific revision snapshot.
- Stream the file response — don't buffer in memory.

### PDF Export
- Render sheet data as clean HTML table.
- Use Playwright to print HTML → PDF.
- Print settings:
  - Scope: active sheet / selected range / all sheets / summary only
  - Orientation: portrait / landscape
  - Scaling: fit to page / actual size / custom %
  - Gridlines: on / off
  - Repeat headers: on / off
- For large sheets: paginate intelligently (break at row boundaries).
- Heavy workbooks: PDF export runs as background job.

## 9. Async Job System

### Job Lifecycle

```
Client Request
    ↓
Backend creates Job record (status: 'pending')
    ↓
Returns { jobId } immediately (HTTP 202)
    ↓
Job runner picks up job (status: 'running')
    ↓
Updates progress periodically
    ↓
On completion: status: 'completed', result: { downloadUrl }
On failure: status: 'failed', error: message
    ↓
Client polls GET /jobs/:jobId
    ↓
When completed → client downloads result
```

### Job Triggers
- PDF export of any workbook
- XLSX export of Large/Heavy workbook
- Sort on Large/Heavy workbook
- Paste > 50k cells
- AI operations affecting > 10k cells
- Summary generation on Heavy workbook

### Polling Strategy (Frontend)
- Poll every 1 second for first 10 seconds
- Then every 3 seconds for next 30 seconds
- Then every 5 seconds until completion
- Show progress bar with percentage
- Allow cancel for safe-to-cancel operations

## 10. Edge Case Handling Checklist

### Spreadsheet Edge Cases
- [ ] Circular reference detection → show warning, don't crash
- [ ] Formula referencing deleted sheet → show #REF! error
- [ ] Paste exceeding sheet bounds → truncate with warning
- [ ] Merged cell edit → edit applies to top-left cell
- [ ] Column beyond ZZ → proper column letter generation
- [ ] Empty workbook upload → create default Sheet1
- [ ] CSV upload → single sheet, auto-detect delimiter
- [ ] Number stored as text → detect and offer conversion

### AI Edge Cases
- [ ] Ambiguous column names → ask for clarification
- [ ] No headers detected → ask user to confirm row 1 as headers
- [ ] AI suggests overwriting data → require explicit confirmation
- [ ] AI operation on empty sheet → return helpful message
- [ ] AI timeout → cancel gracefully, no partial writes
- [ ] Multiple AI requests queued → process sequentially per workbook

### Performance Edge Cases
- [ ] 10M+ cell workbook → reject with clear message about limits
- [ ] 500+ columns → enable column virtualization automatically
- [ ] 1000+ formulas with volatile functions → switch to manual calc
- [ ] Rapid consecutive edits → debounce + batch
- [ ] Browser tab inactive → pause polling, resume on focus
- [ ] Network disconnect during save → queue actions, retry on reconnect

### Export Edge Cases
- [ ] Export during active recalculation → wait for stable state
- [ ] PDF of sheet with 10k+ rows → paginate, warn about size
- [ ] XLSX with unsupported formula → export as value with comment
- [ ] Concurrent export requests → queue, don't duplicate

## 11. API Endpoint Reference

```
POST   /api/auth/login
POST   /api/workbooks/upload
GET    /api/workbooks
GET    /api/workbooks/:id
GET    /api/workbooks/:id/sheets/:sheetId?range=A1:Z100
POST   /api/workbooks/:id/actions
GET    /api/workbooks/:id/revisions
POST   /api/workbooks/:id/revisions/:revId/revert
POST   /api/workbooks/:id/ai/prompt
POST   /api/workbooks/:id/summary
GET    /api/workbooks/:id/export/xlsx?rev=:revId
POST   /api/workbooks/:id/export/pdf
GET    /api/jobs/:jobId
DELETE /api/jobs/:jobId
```

## 12. Environment Variables

```env
# Database
DATABASE_URL=postgresql://...@neon.tech/excelflow

# Auth
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=<secure-password>

# Storage
UPLOAD_DIR=./uploads
EXPORT_DIR=./exports
MAX_UPLOAD_SIZE_MB=50

# AI
AI_API_KEY=<key>
AI_MODEL=gpt-4o
AI_MAX_TOKENS=4096

# App
PORT=4000
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

## 13. Key Decision Log

| Decision | Choice | Rationale |
|---|---|---|
| Monorepo tool | Turborepo | Fast, simple, good TS support |
| ORM | Prisma | Type-safe, great Neon support, migrations |
| Formula engine | HyperFormula | Only serious open-source option, Excel-compatible |
| Grid | AG Grid | Industry standard, virtualization built-in |
| PDF | Playwright | Full browser rendering, accurate output |
| State | Zustand | Lightweight, no boilerplate, great DX |
| Validation | Zod | Shared FE/BE, composable, great inference |
| HTTP adapter | Fastify | 2x faster than Express, schema validation |
