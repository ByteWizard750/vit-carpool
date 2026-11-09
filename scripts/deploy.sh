#!/usr/bin/env bash
# ==============================================================================
# VIT Carpool - Production Deployment Script
# Target: AWS EC2 t4g.small (ap-south-1 Mumbai)
# Zero-downtime container rolling upgrade with pre-flight migration checks
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

echo "============================================================"
echo " Starting VIT Carpool Production Deployment"
echo " Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo " Host: $(hostname)"
echo " Arch: $(uname -m)"
echo "============================================================"

# Pre-flight check: .env.production must exist
if [ ! -f ".env.production" ]; then
  echo "[-] ERROR: .env.production file is missing in ${ROOT_DIR}!"
  echo "    Fetch secrets from AWS SSM Parameter Store before deploying."
  exit 1
fi

# Pre-flight check: docker-compose.prod.yml must exist
if [ ! -f "docker-compose.prod.yml" ]; then
  echo "[-] ERROR: docker-compose.prod.yml not found in ${ROOT_DIR}!"
  exit 1
fi

# Save current running container image IDs for rollback capability
PREV_API_IMAGE=$(docker inspect --format='{{.Image}}' vit_carpool_api 2>/dev/null || echo "none")
PREV_WEB_IMAGE=$(docker inspect --format='{{.Image}}' vit_carpool_web 2>/dev/null || echo "none")
echo "[+] Current running images saved: api=${PREV_API_IMAGE:0:12}, web=${PREV_WEB_IMAGE:0:12}"
echo "${PREV_API_IMAGE}" > .prev_api_image
echo "${PREV_WEB_IMAGE}" > .prev_web_image

# 1. Pull latest verified production images from GitHub Container Registry (ghcr.io)
echo "[+] Step 1: Pulling latest container images..."
docker compose -f docker-compose.prod.yml pull

# 2. Run Prisma database migrations safely before traffic switch
echo "[+] Step 2: Applying database migrations with Prisma deploy..."
docker compose -f docker-compose.prod.yml run --rm --no-deps api \
  ./packages/db/node_modules/.bin/prisma migrate deploy --schema=packages/db/prisma/schema.prisma

# 3. Launch/Upgrade containers in detached mode
echo "[+] Step 3: Rolling container restart with healthchecks..."
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# 4. Wait and verify health of all containers
echo "[+] Step 4: Awaiting container health confirmation..."
TIMEOUT=60
ELAPSED=0
HEALTHY=false

while [ $ELAPSED -lt $TIMEOUT ]; do
  API_STATUS=$(docker inspect --format='{{.State.Health.Status}}' vit_carpool_api 2>/dev/null || echo "starting")
  WEB_STATUS=$(docker inspect --format='{{.State.Health.Status}}' vit_carpool_web 2>/dev/null || echo "starting")
  CADDY_STATUS=$(docker inspect --format='{{.State.Status}}' vit_carpool_caddy 2>/dev/null || echo "starting")

  if [ "$API_STATUS" = "healthy" ] && [ "$WEB_STATUS" = "healthy" ] && [ "$CADDY_STATUS" = "running" ]; then
    HEALTHY=true
    break
  fi

  echo "    Waiting for services (api: ${API_STATUS}, web: ${WEB_STATUS}, caddy: ${CADDY_STATUS}) ... ${ELAPSED}s"
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done

if [ "$HEALTHY" = true ]; then
  echo "============================================================"
  echo "[✓] DEPLOYMENT SUCCESSFUL!"
  echo "    All containers are healthy and serving production traffic."
  echo "============================================================"
  # Clean up dangling images to keep EC2 30GB disk healthy
  docker image prune -f --filter "until=72h" >/dev/null 2>&1 || true
  exit 0
else
  echo "============================================================"
  echo "[-] ERROR: Healthcheck timed out after ${TIMEOUT}s!"
  echo "    API status: ${API_STATUS}"
  echo "    Web status: ${WEB_STATUS}"
  echo "    Initiating automatic rollback..."
  echo "============================================================"
  "${SCRIPT_DIR}/rollback.sh"
  exit 1
fi

