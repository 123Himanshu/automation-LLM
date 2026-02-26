# ── Stage 1: Build ──
FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY turbo.json ./
COPY tsconfig.base.json ./

COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install all dependencies (hoisted to /app/node_modules)
RUN npm ci --legacy-peer-deps

# Copy shared package source and build it
COPY packages/shared/ ./packages/shared/
WORKDIR /app/packages/shared
RUN npx tsc

# Copy API source
WORKDIR /app
COPY apps/api/ ./apps/api/

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

COPY --from=builder /app ./

RUN rm -rf packages/shared/src apps/api/src apps/web \
    tsconfig.base.json turbo.json .turbo
RUN npm prune --omit=dev --legacy-peer-deps 2>/dev/null || true

ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright
RUN npx playwright install chromium 2>/dev/null || true

RUN mkdir -p /app/apps/api/uploads /app/apps/api/exports

WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV UPLOAD_DIR=./uploads
ENV EXPORT_DIR=./exports

EXPOSE ${PORT:-4000}

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -q --spider http://localhost:${PORT:-4000}/api/health || exit 1

CMD ["node", "dist/main.js"]
