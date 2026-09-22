FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY src/ src/
COPY scripts/ scripts/

RUN npm run build

# ── Production stage ──

FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN groupadd -r ashenu && useradd -r -g ashenu -m ashenu

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/web/public ./dist/web/public

RUN mkdir -p data backups && chown -R ashenu:ashenu /app

USER ashenu

EXPOSE 9002

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:9002/health || exit 1

CMD ["bash", "scripts/start.sh"]
