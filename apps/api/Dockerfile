# ==============================================================================
# VIT Carpool API - Production Multi-Stage Dockerfile
# Optimized for ARM64 (AWS Graviton2 / t4g.small) and x86_64
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Base image with pnpm and runtime utilities
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Install openssl (for Prisma query engine) and dumb-init (for PID 1 signal handling)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    dumb-init \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@12.15.0 --activate

WORKDIR /app

# ------------------------------------------------------------------------------
# Stage 2: Dependencies and Builder
# ------------------------------------------------------------------------------
FROM base AS builder

WORKDIR /app

# Copy package manifests and base TypeScript configuration for workspace dependency resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/

# Install full workspace dependencies (including devDependencies for compilation)
RUN pnpm install --frozen-lockfile

# Copy source trees
COPY packages/contracts ./packages/contracts
COPY packages/db ./packages/db
COPY apps/api ./apps/api

# Build shared contracts, generate Prisma client, and build NestJS API
RUN pnpm --filter @vit-carpool/contracts build
RUN pnpm --filter @vit-carpool/db build
RUN pnpm --filter @vit-carpool/api build

# Prune development dependencies to minimize runtime image footprint
RUN pnpm prune --prod

# ------------------------------------------------------------------------------
# Stage 3: Hardened Production Runtime
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    dumb-init \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Set up runtime user and uploads fallback directory
RUN chown -R node:node /app
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# Copy built artifacts and production dependencies with non-root ownership
COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/pnpm-workspace.yaml ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages/contracts ./packages/contracts
COPY --chown=node:node --from=builder /app/packages/db ./packages/db
COPY --chown=node:node --from=builder /app/apps/api/package.json ./apps/api/
COPY --chown=node:node --from=builder /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=builder /app/apps/api/node_modules ./apps/api/node_modules

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "apps/api/dist/src/main.js"]
