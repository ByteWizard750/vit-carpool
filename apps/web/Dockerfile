# ==============================================================================
# VIT Carpool Web - Production Multi-Stage Dockerfile
# Optimized for ARM64 (AWS Graviton2 / t4g.small) and x86_64
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build static web assets
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@12.15.0 --activate

WORKDIR /app

# Copy workspace definitions and base TypeScript configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source trees
COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web

# Build contracts and compile Vite React production bundle
RUN pnpm --filter @vit-carpool/contracts build
RUN pnpm --filter @vit-carpool/web build

# ------------------------------------------------------------------------------
# Stage 2: Unprivileged Nginx static server
# ------------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:alpine-slim AS runner

# Copy custom Nginx configuration
COPY --chown=nginx:nginx apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled SPA bundle from builder
COPY --chown=nginx:nginx --from=builder /app/apps/web/dist /usr/share/nginx/html

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/web-health || exit 1

CMD ["nginx", "-g", "daemon off;"]
