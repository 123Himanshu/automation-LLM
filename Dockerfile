# ─── ExcelFlow API — Root-level Dockerfile ───
# Build context: repo root

# ── Stage 1: Build ──
FROM node:20-slim AS builder
WORKDIR /app

# Copy workspace root config + lockfile
COPY excelflow/package.json excelflow/package-lock.json ./
COPY excelflow/turbo.json ./
COPY excelflow/tsconfig.base.json ./

# Copy ALL workspace package.json files (npm workspaces needs them)
COPY excelflow/packages/shared/package.json ./packages/shared/
COPY excelflow/apps/api/package.json ./apps/api/
COPY excelflow/apps/web/package.json ./apps/web/

# Install all dependencies (hoisted to /app/node_modules)
RUN npm ci --legacy-peer-deps

# Copy shared package source and build it
COPY excelflow/packages/shared/ ./packages/shared/
WORKDIR /app/packages/shared
RUN npx tsc

# Copy API source
WORKDIR /app
COPY excelflow/apps/api/ ./apps/api/

# Generate Prisma client + build NestJS
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npx @nestjs/cli build

# ── Stage 2: Production ──
FROM node:20-slim AS runner

# Install system deps for Playwright (PDF export)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 \
    libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 \
    libxrandr2 libxss1 libxtst6 wget xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the ENTIRE workspace from builder (preserves symlinks + node_modules structure)
COPY --from=builder /app ./

# Remove source files and dev artifacts to slim down
RUN rm -rf packages/shared/src apps/api/src apps/web \
    tsconfig.base.json turbo.json .turbo

# Prune dev dependencies
RUN npm prune --omit=dev --legacy-peer-deps 2>/dev/null || true

# Install Playwright browser for PDF export
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright
RUN npx playwright install chromium 2>/dev/null || true

# Create upload/export directories
RUN mkdir -p /app/apps/api/uploads /app/apps/api/exports

WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=4000
ENV UPLOAD_DIR=./uploads
ENV EXPORT_DIR=./exports

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -q --spider http://localhost:${PORT}/api/health || exit 1

CMD ["node", "dist/main.js"]
