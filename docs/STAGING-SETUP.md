# VIT Carpool — Staging Deployment Setup & Runbook

This guide provides step-by-step instructions for establishing, configuring, and verifying a controlled staging demonstration environment for the VIT Carpool platform.

---

## 1. Prerequisites & Architecture

A staging deployment validates real-world networking, reverse-proxy routing, HTTPS termination, PostGIS geospatial queries, and institutional authentication before any production release.

### Target Topology
* **PostgreSQL + PostGIS**: Managed Postgres 16+ with PostGIS 3.4+ (e.g. Supabase, AWS RDS, Neon, or dedicated container).
* **API Service**: Node.js 20+ runtime running NestJS on port 3000.
* **Frontend**: Static asset host (Nginx, Cloudflare Pages, Vercel, or AWS S3+CloudFront) serving the Vite React SPA.
* **Reverse Proxy / Ingress**: Nginx, Caddy, or Cloudflare routing `/api/*` to the API service and `/*` to the static web application.

---

## 2. Cryptographic Secret Generation

Never reuse development keys or passwords for staging. Generate dedicated staging credentials:

```bash
# 1. Generate 2048-bit RSA Private Key for RS256 JWT Authentication
openssl genrsa -out staging_jwt_private.pem 2048

# 2. Extract Public Key in PEM format
openssl rsa -in staging_jwt_private.pem -pubout -out staging_jwt_public.pem

# 3. Generate 32-byte HMAC Secret for OTP Verification
openssl rand -hex 32
```

---

## 3. Staging Environment Configuration (`.env.staging`)

Create an environment configuration file for the staging deployment. 

> [!CAUTION]
> Never commit populated `.env.staging` files containing secrets to version control.

```env
# Runtime
NODE_ENV=staging
PORT=3000

# Database (PostgreSQL 16 with PostGIS)
# Pooled transaction connection string for runtime queries:
DATABASE_URL="postgresql://carpool_staging:STAGING_DB_PASSWORD@staging-db.vitcarpool.internal:6543/vit_carpool_staging?sslmode=require"
# Direct non-pooled connection string strictly for Prisma migrations:
DIRECT_URL="postgresql://carpool_staging:STAGING_DB_PASSWORD@staging-db.vitcarpool.internal:5432/vit_carpool_staging?sslmode=require"

# Reverse Proxy & CORS
TRUST_PROXY=1
CORS_ORIGIN="https://staging.vitcarpool.app"

# RS256 JWT Asymmetric Keys (Base64-encoded or raw multi-line string)
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
JWT_KEY_ID="vit-carpool-staging-key-2026-v1"
JWT_ISSUER="https://staging.vitcarpool.app/api/auth/v1"
JWT_AUDIENCE="authenticated"

# Custom OTP HMAC Secret
OTP_HMAC_SECRET="<32-byte-hex-string-from-step-2>"

# Transactional SMTP Relay
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="vitcarpool.staging@gmail.com"
SMTP_PASS="staging-app-specific-password"
SMTP_FROM="\"VIT Carpool Staging\" <vitcarpool.staging@gmail.com>"

# Institutional Domain Validation
STUDENT_EMAIL_REGEX="^[a-zA-Z0-9._%+-]+@vitstudent\\.ac\\.in$"
FACULTY_EMAIL_REGEX="^[a-zA-Z0-9._%+-]+@vit\\.ac\\.in$"

# Web Frontend Configuration (bundled at build time)
VITE_API_BASE_URL="https://staging.vitcarpool.app"
```

---

## 4. Database Initialization & Migration

Initialize PostGIS extensions and execute pending Prisma migrations against the staging database:

```bash
# 1. Enable required PostgreSQL extensions (run once as DB superuser)
psql "$DIRECT_URL" -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql "$DIRECT_URL" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"

# 2. Deploy schema migrations (non-destructive)
pnpm --filter @vit-carpool/db prisma migrate deploy

# 3. Verify spatial indexes exist
psql "$DIRECT_URL" -c "SELECT indexname FROM pg_indexes WHERE tablename = 'rides';"
```

---

## 5. Build Workspace Artifacts

Compile TypeScript packages, NestJS API application, and Vite React frontend bundle:

```bash
# Typecheck entire workspace
pnpm -r run typecheck

# Build contracts, db client, API, and Web distribution
pnpm -r run build
```

Build outputs:
* API: `apps/api/dist/main.js`
* Web: `apps/web/dist/` (static SPA assets)

---

## 6. Reverse Proxy Configuration (Nginx Example)

Configure Nginx to handle SSL termination, static file serving, and API reverse proxying:

```nginx
server {
    listen 80;
    server_name staging.vitcarpool.app;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name staging.vitcarpool.app;

    ssl_certificate /etc/letsencrypt/live/staging.vitcarpool.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/staging.vitcarpool.app/privkey.pem;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Frontend Single Page Application (SPA)
    root /var/www/vit-carpool/apps/web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health Check Endpoint
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        proxy_set_header Host $host;
    }
}
```

---

## 7. Service Process Management (PM2 Example)

Run the NestJS API with automatic restart and zero-downtime reloads:

```bash
# Start API in cluster mode (or single fork for staging)
pm2 start apps/api/dist/src/main.js --name "vit-carpool-api-staging" --env production

# Check status and logs
pm2 status
pm2 logs vit-carpool-api-staging --lines 50
```

---

## 8. Verification & Health Check

Confirm service availability across all layers:

1. **API Health & Database Check**:
   ```bash
   curl -i https://staging.vitcarpool.app/health
   # Expected: HTTP 200 OK
   # {"status":"ok","database":"connected","postgis":"connected"}
   ```

2. **Public JWKS Verification**:
   ```bash
   curl -s https://staging.vitcarpool.app/api/.well-known/jwks.json | jq .
   # Expected: Valid JWKS object with matching kid
   ```

3. **Frontend Asset Delivery**:
   ```bash
   curl -I https://staging.vitcarpool.app/
   # Expected: HTTP 200 OK, text/html
   ```

4. **Automated Smoke Test Verification**:
   Execute the Playwright smoke suite against the staging URL:
   ```bash
   PLAYWRIGHT_BASE_URL=https://staging.vitcarpool.app pnpm --filter @vit-carpool/web run test:e2e
   ```

---

## 9. Rollback & Disaster Recovery Procedures

If a deployment failure or regression is detected:

1. **API Rollback**:
   ```bash
   git checkout <PREVIOUS_HEALTHY_COMMIT>
   pnpm --filter @vit-carpool/api run build
   pm2 restart vit-carpool-api-staging
   ```
2. **Frontend Rollback**:
   Point Nginx or CDN origin back to previous `dist` build directory.
3. **Database Schema Rollback**:
   Since migrations are strictly additive, do not drop columns or reset databases. If a schema bug occurs, apply a forward corrective migration:
   ```bash
   pnpm --filter @vit-carpool/db prisma migrate deploy
   ```
