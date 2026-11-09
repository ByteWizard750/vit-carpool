#!/usr/bin/env bash
# ==============================================================================
# VIT Carpool - Automated Rollback Script
# Restores previous working container images in case of deployment healthcheck failure
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

echo "============================================================"
echo " Initiating VIT Carpool Automated Rollback"
echo " Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "============================================================"

if [ ! -f ".prev_api_image" ] || [ ! -f ".prev_web_image" ]; then
  echo "[-] WARNING: Previous image cache files not found. Falling back to docker compose up -d"
  docker compose -f docker-compose.prod.yml restart
  exit 0
fi

PREV_API=$(cat .prev_api_image)
PREV_WEB=$(cat .prev_web_image)

if [ "$PREV_API" = "none" ] || [ -z "$PREV_API" ]; then
  echo "[-] No previous API container image found to rollback to."
  exit 1
fi

echo "[+] Restoring API image: ${PREV_API:0:12}"
echo "[+] Restoring Web image: ${PREV_WEB:0:12}"

# Export image overrides and restart containers
export API_IMAGE="${PREV_API}"
export WEB_IMAGE="${PREV_WEB}"

docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "[✓] Rollback containers started. Checking recovery health..."
sleep 10

API_STATUS=$(docker inspect --format='{{.State.Health.Status}}' vit_carpool_api 2>/dev/null || echo "unknown")
WEB_STATUS=$(docker inspect --format='{{.State.Health.Status}}' vit_carpool_web 2>/dev/null || echo "unknown")

echo "    Current API status: ${API_STATUS}"
echo "    Current Web status: ${WEB_STATUS}"

if [ "$API_STATUS" = "healthy" ]; then
  echo "[✓] Rollback successfully restored application health!"
else
  echo "[-] WARNING: Services are still recovering. Inspect logs with: docker compose -f docker-compose.prod.yml logs --tail 100"
fi

