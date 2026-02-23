# ─── ExcelFlow API — Monorepo-root Dockerfile ───
# Build context: excelflow/

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Stub web workspace so npm ci resolves all workspaces
RUN mkdir -p apps/web && echo '{"name":"@excelflow/web","version":"0.1.0","private":true}' > apps/web/package.json

RUN npm ci --legacy-peer-deps

FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

WORKDIR /app/packages/shared
RUN npx tsc

WORKDIR /app/apps/api
RUN npx prisma generate
RUN npx @nestjs/cli build

FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 \
    libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 \
    libxrandr2 libxss1 libxtst6 wget xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright
RUN npx playwright install chromium 2>/dev/null || true
RUN mkdir -p /app/apps/api/uploads /app/apps/api/exports

WORKDIR /app/apps/api
ENV NODE_ENV=production
ENV PORT=4000
ENV UPLOAD_DIR=./uploads
ENV EXPORT_DIR=./exports
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:${PORT}/api/workbooks || exit 1

CMD ["node", "dist/main.js"]
