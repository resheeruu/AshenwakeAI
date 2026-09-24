FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY src/ src/
COPY scripts/ scripts/

RUN npm run build

# — Production stage —

FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl logrotate procps && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN groupadd -r ashenu && useradd -r -g ashenu -m ashenu

# Copy application artifacts
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/web/public ./dist/web/public

# Create writable data volume only for application data
RUN mkdir -p data backups && chown -R ashenu:ashenu /app/data /app/backups

# Security hardening
USER ashenu

# Prevent privilege escalation
RUN chmod 700 /app/data && chmod 700 /app/backups

STOPSIGNAL SIGTERM

# Host may override with -e PORT=...; default matches EXPOSE/HEALTHCHECK below.
ENV PORT=9002

# Read-only filesystem with explicit writable mounts
# Runtime flag: docker run --read-only --tmpfs /tmp --tmpfs /app/data --tmpfs /app/backups
# Prefer docker-compose.yml for full hardening (read_only, cap_drop: [ALL],
# security_opt: no-new-privileges, tmpfs/volume mounts for data/backups/tmp).
EXPOSE 9002

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:9002/api/health || exit 1

# Log rotation via logrotate at container level
COPY logrotate.conf /etc/logrotate.d/ashenai
RUN logrotate -s /var/lib/logrotate/status ashenai || true

# No-new-privileges enforced via Docker --security-opt=no-new-privileges
# (also set in docker-compose.yml security_opt)
CMD ["bash", "scripts/start.sh"]