---
inclusion: always
---

# ExcelFlow — Architecture & Coding Standards

This steering document defines the non-negotiable engineering standards, architecture decisions, and coding practices for the ExcelFlow project. Every file, component, module, and feature MUST comply with these rules.

## 1. Project Architecture

### 1.1 Monorepo Structure (Turborepo)

```
excelflow/
├── apps/
│   ├── web/                    # Next.js frontend (App Router)
│   └── api/                    # NestJS backend (Fastify adapter)
├── packages/
│   └── shared/                 # Shared Zod schemas, types, constants
├── turbo.json
├── package.json
└── tsconfig.base.json
```

### 1.2 Frontend Structure (Next.js App Router + TypeScript)

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/             # Auth route group
│   │   ├── workbook/[id]/      # Workbook editor page
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                 # shadcn/ui primitives (Button, Dialog, etc.)
│   │   ├── spreadsheet/        # AG Grid wrapper, formula bar, sheet tabs
│   │   ├── chat/               # AI chat panel components
│   │   ├── export/             # Export modals (XLSX, PDF)
│   │   ├── summary/            # Quick Summary modal and display
│   │   └── layout/             # Shell, sidebar, header, resize handle
│   ├── hooks/                  # Custom React hooks
│   ├── stores/                 # Zustand stores (sliced by domain)
│   ├── lib/                    # Utilities, API client, constants
│   ├── types/                  # Frontend-only TypeScript types
│   └── styles/                 # Global CSS, Tailwind config
├── public/
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

### 1.3 Backend Structure (NestJS + Fastify)

```
apps/api/
├── src/
│   ├── main.ts                 # Bootstrap with Fastify adapter
│   ├── app.module.ts           # Root module
│   ├── modules/
│   │   ├── workbook/           # Upload, parse, classify, CRUD
│   │   ├── action/             # Action engine (validate, apply, recalc)
│   │   ├── revision/           # Revision history, snapshots
│   │   ├── ai/                 # AI orchestrator, context builder, tool calls
│   │   ├── summary/            # Quick Summary engine
│   │   ├── export/             # XLSX + PDF export
│   │   ├── job/                # In-process async job runner
│   │   └── auth/               # Basic auth middleware
│   ├── common/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── filters/
│   │   ├── pipes/
│   │   └── decorators/
│   ├── config/                 # Environment config, validation
│   └── database/               # Prisma or Drizzle ORM setup for Neon
├── prisma/                     # Schema + migrations
├── test/
└── tsconfig.json
```

### 1.4 Shared Package

```
packages/shared/
├── src/
│   ├── schemas/                # Zod schemas (action, workbook, cell, etc.)
│   ├── types/                  # Shared TypeScript interfaces
│   ├── constants/              # Enums, limits, thresholds
│   └── utils/                  # Pure utility functions
└── tsconfig.json
```

## 2. Coding Standards (Non-Negotiable)

### 2.1 File Size Limit
- Every code file MUST be under 500 lines. No exceptions.
- If a file approaches 400 lines, proactively split it.
- Use barrel exports (index.ts) to keep imports clean after splitting.

### 2.2 TypeScript Strictness
- `strict: true` in all tsconfig files.
- No `any` type. Use `unknown` + type guards when type is uncertain.
- Use `as const` assertions instead of enums.
- All function parameters and return types MUST be explicitly typed.
- Use discriminated unions for complex state.

### 2.3 Naming Conventions
- Files: `kebab-case.ts` / `kebab-case.tsx`
- Components: `PascalCase` (function name matches file export)
- Hooks: `use-` prefix, e.g., `use-workbook-store.ts`
- Stores: `*-store.ts`
- Schemas: `*-schema.ts`
- Types: `*-types.ts`
- Constants: `UPPER_SNAKE_CASE` for values, `kebab-case.ts` for files
- NestJS services: `*.service.ts`, controllers: `*.controller.ts`, modules: `*.module.ts`

### 2.4 Component Rules (Frontend)
- One component per file.
- Props interface defined above the component, named `{ComponentName}Props`.
- Use `React.FC` sparingly — prefer plain function declarations.
- Memoize expensive computations with `useMemo` / `useCallback`.
- Never put business logic in components — delegate to hooks or stores.
- All interactive elements must have proper ARIA attributes.

### 2.5 State Management (Zustand)
- One store per domain: `workbook-store`, `ui-store`, `chat-store`, `job-store`.
- Use slices pattern for large stores.
- Never store derived state — compute it with selectors.
- Actions are defined inside the store, not in components.
- Use `immer` middleware for complex nested updates.
- Persist only what's necessary (revision ID, preferences).

### 2.6 API Communication
- Use a typed API client wrapper (fetch-based or React Query).
- All API responses validated with Zod on the frontend.
- All API request bodies validated with Zod on the backend.
- Shared schemas live in `packages/shared`.
- Use proper HTTP status codes: 200, 201, 400, 401, 404, 409, 422, 500.
- Streaming responses for large downloads.

### 2.7 Error Handling
- Frontend: Error boundaries at route level + toast notifications for API errors.
- Backend: Global exception filter + domain-specific exceptions.
- Never swallow errors silently.
- Log errors with structured context (workbookId, revisionId, action type).
- User-facing error messages must be clear and actionable.

### 2.8 Backend Rules (NestJS)
- Every module is self-contained: controller, service, DTOs, module file.
- Use constructor injection (NestJS DI).
- DTOs validated with Zod (via custom pipe or `nestjs-zod`).
- Controllers are thin — all logic in services.
- Use interceptors for response transformation.
- Use guards for auth.
- Database queries in dedicated repository services, not in business services.

## 3. Performance Standards

### 3.1 Frontend Performance
- AG Grid: Use row virtualization always. Column virtualization for wide sheets.
- Lazy load non-critical components (chat panel, export modals, summary modal).
- Use `React.lazy` + `Suspense` for code splitting.
- Debounce cell edits before sending to backend (300ms).
- Batch multiple cell changes into single action requests.
- Use Web Workers for heavy client-side computations if needed.
- Images and assets optimized via Next.js Image component.

### 3.2 Backend Performance
- Fastify adapter for 2x throughput over Express.
- Stream file uploads — never buffer entire file in memory.
- Paginate/chunk large sheet data responses.
- Use database connection pooling (Neon serverless driver).
- Cache workbook metadata in memory during active sessions.
- Background jobs for operations exceeding 5 seconds.

### 3.3 HyperFormula Integration
- Single HyperFormula instance per workbook session on backend.
- Use `AlwaysSparse` matrix for large sheets.
- Batch cell updates before triggering recalculation.
- Use `suspendEvaluation()` / `resumeEvaluation()` for bulk operations.
- Handle circular references gracefully — detect and report, don't crash.
- Cross-sheet formulas must use proper sheet name references.

## 4. Security Standards

### 4.1 Input Validation
- ALL user input validated at API boundary with Zod.
- File uploads: validate MIME type, file extension, and file size (max 50MB).
- Sanitize sheet names and cell values to prevent injection.
- Rate limit upload and export endpoints.

### 4.2 Authentication
- Basic Auth at middleware level for prototype.
- Credentials stored as environment variables, never in code.
- Session tokens with expiry for workspace isolation.

### 4.3 File Safety
- Parse XLSX in sandboxed context — never execute macros.
- Auto-cleanup uploaded files older than 24 hours.
- Temporary export files deleted after download or after 1 hour.
- File storage paths must not be user-controllable.

## 5. Testing Standards

### 5.1 What to Test
- All Zod schemas: valid and invalid inputs.
- Action engine: validate, apply, recalc pipeline.
- Summary engine: column type detection, metric computation.
- Export: XLSX serialization correctness, PDF generation.
- API endpoints: happy path + error cases.

### 5.2 Testing Tools
- Unit tests: Vitest (frontend + backend).
- Integration tests: Supertest (NestJS endpoints).
- E2E tests: Playwright (critical flows only).
- No test file should exceed 300 lines.

## 6. Git & Code Quality

### 6.1 Commits
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`.
- One logical change per commit.

### 6.2 Linting & Formatting
- ESLint with strict TypeScript rules.
- Prettier for formatting (consistent across monorepo).
- No warnings allowed in CI — treat warnings as errors.

### 6.3 Code Review Checklist
- File under 500 lines?
- Types explicit (no `any`)?
- Error handling present?
- Validation at boundaries?
- No business logic in controllers/components?
- Reusable where possible?
