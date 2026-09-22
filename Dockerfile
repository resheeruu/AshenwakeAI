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

CMD ["bash", "scripts/start.sh"]
