# ExcelFlow

Monorepo for the ExcelFlow web app (`Next.js`) and API (`NestJS + Prisma`).


## Project structure

```text
excelflow/
  apps/
    web/   # Next.js frontend
    api/   # NestJS backend
  packages/
    shared/ # shared types and schemas
```

## Prerequisites

- Node.js `>= 20`
- npm `>= 10`
- PostgreSQL database
- S3-compatible object storage (AWS S3 / MinIO / LocalStack)

## Setup

1. Install dependencies:

```bash
cd excelflow
npm install
```

2. Create API env file:

```bash
cp apps/api/.env.example apps/api/.env
```

3. Update `apps/api/.env` with your real values:
- `DATABASE_URL`
- `BASIC_AUTH_USERNAME`, `BASIC_AUTH_PASSWORD`
- `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (and optional `S3_ENDPOINT`)
- AI config (optional, but needed for AI features):
  - `AI_PROVIDER=openai` with `AI_API_KEY`
  - or `AI_PROVIDER=groq` with `GROQ_API_KEY`
  - optional `AI_MODEL` override (`llama-3.3-70b-versatile` works well on Groq)

4. (Optional) Create `apps/web/.env.local` if you need custom frontend config:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_AUTH_USER=admin
NEXT_PUBLIC_AUTH_PASS=changeme
```

## Database setup

From `excelflow/`:

```bash
npm run db:generate --workspace @excelflow/api
npm run db:push --workspace @excelflow/api
```

## Run locally

From `excelflow/`:

```bash
npm run dev
```

This starts:
- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- API docs (dev): `http://localhost:4000/api/docs`

## Useful commands

From `excelflow/`:

```bash
npm run build
npm run lint
npm run test
```

## Common issues

- `Environment validation failed` on API startup: check required variables in `apps/api/.env`.
- `401 Unauthorized` from frontend: make sure `NEXT_PUBLIC_AUTH_USER/PASS` match API basic auth values.
- CORS errors: set `FRONTEND_URL` in `apps/api/.env` (comma-separated origins if needed).
