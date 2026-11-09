# Second-Pass Production Readiness Audit Report
**Project:** VIT Carpool Platform  
**Target Platform:** AWS Mumbai (`ap-south-1`)  
**Document Version:** 2.0.0 (Pre-Provisioning Verification Audit)  
**Date:** November 4, 2026  
**Auditor:** Senior Principal Systems & DevOps Engineer  

---

## Executive Summary & Audit Methodology

This second-pass audit performed a zero-assumption, source-level inspection across all configuration files, NestJS backend modules, React frontend source code, Prisma schema and migrations, Dockerfiles, orchestration scripts, and CI/CD pipelines.

### Key Finding
**The application is NOT ready for AWS provisioning or production deployment.**

While TypeScript compilation passes cleanly and individual Docker images build without error, our deep inspection revealed **multiple critical architectural and configuration blockers** that would cause:
1. Immediate API container startup crashes in production due to missing Zod environment variables (`EnvValidationError`).
2. Immediate failure of 100% of frontend API calls (returning `404 Not Found` or Nginx `200 OK` HTML instead of JSON) due to a fundamental routing mismatch between frontend fetch URLs, NestJS controller decorators, and Caddy ingress rules.
3. Immediate global user lockout across the entire campus due to an Express `trust proxy` type-parsing bug that collapses all client IPs into `127.0.0.1` and triggers the authentication rate limiter after only 3 to 10 requests.
4. Silent deployment script failures during database migrations due to `prisma` CLI being pruned from the production runtime container.
5. Inability for GitHub Actions to connect to EC2 due to a network security group deadlock.

The detailed findings, impact analyses, and precise remedial actions are documented below.

---

## Detailed Audit Findings by Functional Area

```
Severity Levels:
  CRITICAL : Will cause fatal system failure, startup crash, or platform-wide outage. Must fix before launch.
  HIGH     : Serious security loophole, data loss risk, or broken core user flow. Must fix before launch.
  MEDIUM   : Operational impedance, deployment fragility, or maintainability risk.
  LOW      : Informational discrepancy or minor hygiene improvement.
```

---

### Area 1: Existing Upload Compatibility & Storage Driver

#### Finding 1.1: Missing S3 Objects Fail Without Local Disk Fallback
* **Severity:** **HIGH**
* **File & Lines:** [`apps/api/src/modules/uploads/uploads.controller.ts#L28-L34`](file:///Users/rohan/Vit-Carpool/apps/api/src/modules/uploads/uploads.controller.ts#L28-L34), [`apps/api/src/modules/uploads/uploads.service.ts#L229-L255`](file:///Users/rohan/Vit-Carpool/apps/api/src/modules/uploads/uploads.service.ts#L229-L255)
* **What is Wrong:** When `STORAGE_PROVIDER=s3`, `serveImage` calls `getPresignedUrl(category, filename)`. `@aws-sdk/s3-request-presigner` generates a signed URL deterministically in-memory *without verifying whether the object actually exists in the S3 bucket*. The controller immediately issues a `302 Found` redirect to S3.
* **Why it Matters:** Any user avatar or vehicle photo that was uploaded prior to enabling S3 (or any missing S3 object) will redirect the browser to S3, which returns an XML `404 NoSuchKey` or `403 Forbidden` error. The local disk fallback (`resolveFilePath`) is completely bypassed. All existing avatars become broken images.
* **Recommended Correction:**
  1. Provide a one-time migration script (`scripts/migrate-uploads-to-s3.ts`) using AWS SDK to synchronize existing local uploads to the S3 bucket during deployment cutover.
  2. In `UploadsService.getPresignedUrl`, if an object is not in S3, gracefully fall back to serving the local file if present on disk, or lazily stream-upload it to S3 on the first cache miss.
* **Action Required:** Code changes + Operational migration script.

#### Finding 1.2: Orphaned Local Files Left on Disk After S3 Enablement
* **Severity:** **MEDIUM**
* **File & Lines:** [`apps/api/src/modules/uploads/uploads.service.ts#L202-L212`](file:///Users/rohan/Vit-Carpool/apps/api/src/modules/uploads/uploads.service.ts#L202-L212)
* **What is Wrong:** In `deleteImage()`, when `this.isS3Configured` is `true`, the service sends a `DeleteObjectCommand` to S3 and immediately returns. It never cleans up the legacy local file at `${baseUploadDir}/${category}/${filename}`.
* **Why it Matters:** If a user with an existing local avatar uploads a new avatar after S3 is enabled, the old local file remains permanently orphaned on the EC2 root volume, slowly leaking disk space.
* **Recommended Correction:** In `deleteImage()`, also check if `fs.existsSync(filePath)` on the local volume and delete it, ensuring dual cleanup during the transition phase.
* **Action Required:** Code changes.

#### Finding 1.3: Verification Document Purge Assumes Local Disk Paths
* **Severity:** **LOW / INFORMATIONAL**
* **File & Lines:** [`apps/api/src/modules/verification/verification-purge.service.ts#L121-L135`](file:///Users/rohan/Vit-Carpool/apps/api/src/modules/verification/verification-purge.service.ts#L121-L135)
* **What is Wrong:** `VerificationPurgeService` executes `fs.existsSync(req.idCardDocumentPath)` and `fs.promises.unlink()`. It has no S3 deletion logic.
* **Why it Matters:** Currently, verification ID document upload endpoints are not yet exposed, so this does not cause immediate runtime errors. However, when ID uploads are implemented on S3, the purge service will fail to delete expired student ID proof files from S3, violating the 30-day institutional privacy mandate.
* **Recommended Correction:** Integrate `UploadsService.deleteImage()` into `VerificationPurgeService` once document uploads are enabled.
* **Action Required:** Code changes (future).

---

### Area 2: Proxy and Client IP Security

#### Finding 2.1: Express `trust proxy` String Type Bug Collapses All Client IPs to `127.0.0.1`
* **Severity:** **CRITICAL (SHOWSTOPPER)**
* **File & Lines:** [`apps/api/src/main.ts#L20-L32`](file:///Users/rohan/Vit-Carpool/apps/api/src/main.ts#L20-L32), [`.env.production.example#L23`](file:///Users/rohan/Vit-Carpool/.env.production.example#L23)
* **What is Wrong:**
  In `main.ts`:
  ```typescript
  const trustProxyEnv = process.env.TRUST_PROXY?.trim();
  if (trustProxyEnv) {
    if (trustProxyEnv === 'true' || trustProxyEnv === '1') {
      app.getHttpAdapter().getInstance().set('trust proxy', 1);
    } else if (trustProxyEnv === 'false' || trustProxyEnv === '0') {
      app.getHttpAdapter().getInstance().set('trust proxy', false);
    } else {
      app.getHttpAdapter().getInstance().set('trust proxy', trustProxyEnv);
    }
  }
  ```
  When `.env.production` provides `TRUST_PROXY=2`, `trustProxyEnv` is the string `"2"`.
  In Express / `proxy-addr`:
  - When passed a **number** (`2`), it trusts the 2 frontmost proxy hops.
  - When passed a **string** (`"2"`), `proxy-addr.compile("2")` treats `"2"` as an IP address or subnet mask! Because `"2"` is not a valid IPv4/IPv6 address, `proxy-addr` compilation fails, trusts **0 hops**, and Express defaults `req.ip` to the direct socket address (`127.0.0.1` or Caddy's internal bridge IP `172.18.0.x`).
* **Why it Matters:**
  **Every incoming request across the entire campus resolves to the exact same IP address.**
  In [`AuthRateLimiterGuard`](file:///Users/rohan/Vit-Carpool/apps/api/src/modules/auth/guards/auth-rate-limiter.guard.ts#L60), the rate limit is 10 requests per 60 seconds (and only 3 for requesting OTPs).
  Within seconds of launch, **the entire student body and faculty are locked out with `429 Too Many Requests`**.
* **Recommended Correction:**
  In `main.ts`, parse numeric string values using `Number(trustProxyEnv)`:
  ```typescript
  const numericHops = Number(trustProxyEnv);
  if (!isNaN(numericHops)) {
    app.getHttpAdapter().getInstance().set('trust proxy', numericHops);
  } else {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyEnv);
  }
  ```
* **Action Required:** Code changes.

#### Finding 2.2: Direct-Origin IP Spoofing via Unauthenticated `CF-Connecting-IP`
* **Severity:** **HIGH**
* **File & Lines:** [`Caddyfile#L32-L33`](file:///Users/rohan/Vit-Carpool/Caddyfile#L32-L33), [`PRODUCTION_DEPLOYMENT_PREPARATION_REPORT.md#L210`](file:///Users/rohan/Vit-Carpool/PRODUCTION_DEPLOYMENT_PREPARATION_REPORT.md#L210)
* **What is Wrong:**
  In `Caddyfile`:
  ```caddyfile
  header_up X-Real-IP {http.request.header.cf-connecting-ip}
  header_up X-Forwarded-For {http.request.header.cf-connecting-ip}
  ```
  And EC2 Security Group allows `0.0.0.0/0` on ports `80` and `443`.
  If an attacker sends HTTP requests directly to the EC2 Elastic IP (bypassing Cloudflare) with a custom header `CF-Connecting-IP: 1.2.3.4`, Caddy blindly trusts and copies this header into `X-Forwarded-For`. Express then records `req.ip = "1.2.3.4"`.
* **Why it Matters:** An attacker can rotate spoofed IP headers to completely bypass IP rate limiting on `/api/auth/request-otp`, spam SMS/email queues, or conduct credential-stuffing attacks without being throttled.
* **Recommended Correction:**
  1. Restrict EC2 Security Group ports `80` and `443` strictly to Cloudflare's published IP ranges (available at `https://www.cloudflare.com/ips-v4` and `https://www.cloudflare.com/ips-v6`), or deploy AWS Cloudflare IP sync lambda.
  2. Alternatively, configure Cloudflare Authenticated Origin Pulls (TLS client certificate verification in Caddy) so Caddy immediately rejects any connection not originating from Cloudflare edge nodes.
* **Action Required:** AWS Security Group configuration + Caddy configuration.

---

### Area 3: Deployment and Rollback Safety

#### Finding 3.1: `npx prisma migrate deploy` Fails in Runtime Container Due to Pruned CLI
* **Severity:** **CRITICAL (DEPLOYMENT BLOCKER)**
* **File & Lines:** [`scripts/deploy.sh#L33-L35`](file:///Users/rohan/Vit-Carpool/scripts/deploy.sh#L33-L35), [`packages/db/package.json#L21`](file:///Users/rohan/Vit-Carpool/packages/db/package.json#L21), [`apps/api/Dockerfile#L48`](file:///Users/rohan/Vit-Carpool/apps/api/Dockerfile#L48)
* **What is Wrong:**
  In `apps/api/Dockerfile`, the builder stage executes `RUN pnpm prune --prod`.
  In `packages/db/package.json`, `"prisma"` is listed in `"devDependencies"` (only `"@prisma/client"` is in `"dependencies"`).
  Therefore, the `prisma` CLI executable is **pruned and absent** from the production container!
  In `scripts/deploy.sh`:
  ```bash
  docker compose -f docker-compose.prod.yml run --rm --no-deps api \
    node -e "const { execSync } = require('child_process'); execSync('npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma', { stdio: 'inherit' });"
  ```
  `npx` searches local `node_modules/.bin/prisma`. Not finding it, `npx` attempts to interactively prompt: `Need to install the following packages: prisma@... Ok to proceed? (y)`. In a non-interactive CI/CD script, this either hangs indefinitely or crashes with exit code 1.
* **Why it Matters:** Production deployments will fail immediately at Step 2 during the migration pre-flight check.
* **Recommended Correction:** Move `"prisma": "^5.22.0"` from `"devDependencies"` to `"dependencies"` in `packages/db/package.json` so that the CLI is preserved in the pruned production image.
* **Action Required:** Code changes (`package.json`).

#### Finding 3.2: False "Zero-Downtime" Claim on Single Container Instance
* **Severity:** **HIGH**
* **File & Lines:** [`scripts/deploy.sh#L38`](file:///Users/rohan/Vit-Carpool/scripts/deploy.sh#L38), [`docker-compose.prod.yml#L53`](file:///Users/rohan/Vit-Carpool/docker-compose.prod.yml#L53)
* **What is Wrong:**
  `scripts/deploy.sh` executes:
  ```bash
  docker compose -f docker-compose.prod.yml up -d --remove-orphans
  ```
  When the image tag changes, Docker Compose stops the running `vit_carpool_api` container before launching the new container. NestJS container boot, Prisma database connection pool initialization, and module bootstrap take between 6 and 15 seconds.
* **Why it Matters:**
  During those 6–15 seconds, Caddy has no upstream container to route to and returns `502 Bad Gateway` to active users. Furthermore, **all active WebSocket connections for live ride tracking (`/socket.io`, `/tracking`) are abruptly severed**. Calling this "zero-downtime" is factually incorrect.
* **Recommended Correction:**
  1. Acknowledge a 10-second maintenance cutover window during off-peak hours (e.g. 2:00 AM), OR
  2. Implement blue-green container rotation on EC2 (e.g., launch `api_green` on port 3001, poll `http://localhost:3001/health` until 200 OK, reload Caddy configuration to switch upstream, then terminate `api_blue`).
* **Action Required:** Script updates + Caddy upstream configuration.

#### Finding 3.3: Database Migrations Lack Automatic Down-Migration / Rollback
* **Severity:** **HIGH**
* **File & Lines:** [`scripts/deploy.sh#L33-L84`](file:///Users/rohan/Vit-Carpool/scripts/deploy.sh#L33-L84), [`scripts/rollback.sh#L1-L45`](file:///Users/rohan/Vit-Carpool/scripts/rollback.sh#L1-L45)
* **What is Wrong:**
  If `prisma migrate deploy` succeeds in Step 2, but container health checks fail in Step 4, `deploy.sh` invokes `rollback.sh`. `rollback.sh` reverts the container image to `PREV_API_IMAGE`.
  However, **Prisma does not support automatic down-migrations**. The database remains at the *new* schema state.
* **Why it Matters:** If the new migration introduced a breaking change (such as dropping a column, renaming a field, or adding a non-null constraint without a default), the old container will crash upon restart. The rollback will fail, leaving the system in a fatal crash loop.
* **Recommended Correction:**
  Enforce a strict engineering rule: **All database migrations must follow the expand-and-contract pattern**. Never drop or rename columns in the same release as code changes. Every migration must remain backward-compatible with the previous software version.
* **Action Required:** Engineering process + migration review policy.

---

### Area 4: AWS IAM and Secrets Management

#### Finding 4.1: Missing SSM Parameter Store Ingestion Script
* **Severity:** **HIGH**
* **File & Lines:** [`scripts/deploy.sh#L20-L25`](file:///Users/rohan/Vit-Carpool/scripts/deploy.sh#L20-L25), [`.github/workflows/deploy.yml#L101-L115`](file:///Users/rohan/Vit-Carpool/.github/workflows/deploy.yml#L101-L115)
* **What is Wrong:**
  `scripts/deploy.sh` verifies that `.env.production` exists on disk:
  ```bash
  if [ ! -f ".env.production" ]; then
    echo "[-] ERROR: .env.production file is missing in ${ROOT_DIR}!"
    exit 1
  fi
  ```
  Neither `deploy.sh` nor `deploy.yml` contains any logic to fetch or decrypt secrets from AWS SSM Parameter Store.
* **Why it Matters:** If an administrator rotates a database password or JWT key in SSM Parameter Store, the EC2 instance will never receive the update unless someone manually connects via SSH and edits the `.env.production` file by hand. Manual editing creates human error risks and defeats the purpose of centralized secret management.
* **Recommended Correction:**
  Provide an automated secret synchronization script: `scripts/fetch-secrets-from-ssm.sh` using AWS CLI:
  ```bash
  aws ssm get-parameters-by-path \
    --path "/vit-carpool/prod/" \
    --with-decryption \
    --query "Parameters[*].[Name,Value]" \
    --output text | while read -r name value; do
      key=$(basename "$name")
      echo "${key}=${value}"
    done > .env.production
  ```
* **Action Required:** Script creation (`scripts/fetch-secrets-from-ssm.sh`).

#### Finding 4.2: CI/CD SSH Connection Blocked by Hardened Security Groups
* **Severity:** **HIGH**
* **File & Lines:** [`.github/workflows/deploy.yml#L88-L100`](file:///Users/rohan/Vit-Carpool/.github/workflows/deploy.yml#L88-L100), [`PRODUCTION_DEPLOYMENT_PREPARATION_REPORT.md#L209`](file:///Users/rohan/Vit-Carpool/PRODUCTION_DEPLOYMENT_PREPARATION_REPORT.md#L209)
* **What is Wrong:**
  `deploy.yml` uses `appleboy/ssh-action` to connect to EC2 over SSH (port 22).
  However, the security baseline states that EC2 port 22 must be restricted to the administrator's fixed IP.
  GitHub Actions runners are hosted on dynamic IP pools across Microsoft Azure / AWS data centers.
* **Why it Matters:** The GitHub Actions `deploy` job will time out after 10 minutes trying to reach port 22, resulting in failed pipeline executions.
* **Recommended Correction:**
  - **Preferred:** Use **AWS Systems Manager (SSM) Run Command** (`aws ssm send-command`) instead of SSH. EC2 runs the AWS SSM Agent, which communicates outbound over HTTPS. Zero inbound ports need to be open on EC2!
  - **Alternative:** Use GitHub Actions to dynamically authorize the runner's IP in the security group using `aws ec2 authorize-security-group-ingress` at job start and revoke it in a `cleanup` step.
* **Action Required:** GitHub Actions workflow update + IAM policy configuration.

#### Finding 4.3: Codified IAM Permissions for EC2 Instance Profile
* **Severity:** **MEDIUM**
* **File & Lines:** [`PRODUCTION_DEPLOYMENT_PREPARATION_REPORT.md#L206`](file:///Users/rohan/Vit-Carpool/PRODUCTION_DEPLOYMENT_PREPARATION_REPORT.md#L206)
* **What is Wrong:** The previous report mentioned attaching an IAM role, but did not define the exact JSON policy required for the EC2 instance profile.
* **Why it Matters:** Over-privileged roles (e.g. `AdministratorAccess`) violate least-privilege principles, while under-privileged roles cause S3 upload or SSM parameter retrieval failures.
* **Recommended Policy Specification:**
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "S3UploadBucketAccess",
        "Effect": "Allow",
        "Action": [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ],
        "Resource": [
          "arn:aws:s3:::vit-carpool-prod-uploads-*",
          "arn:aws:s3:::vit-carpool-prod-uploads-*/*"
        ]
      },
      {
        "Sid": "SSMParameterStoreAccess",
        "Effect": "Allow",
        "Action": [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ],
        "Resource": "arn:aws:ssm:ap-south-1:*:parameter/vit-carpool/prod/*"
      },
      {
        "Sid": "KMSDecryptAccess",
        "Effect": "Allow",
        "Action": "kms:Decrypt",
        "Resource": "arn:aws:kms:ap-south-1:*:alias/aws/ssm"
      }
    ]
  }
  ```
* **Action Required:** AWS IAM configuration.

---

### Area 5: Database and PostGIS Architecture

#### Finding 5.1: Non-Superuser RDS Migration Privilege Failure
* **Severity:** **HIGH**
* **File & Lines:** [`packages/db/prisma/migrations/0_init_foundation/migration.sql#L2-L3`](file:///Users/rohan/Vit-Carpool/packages/db/prisma/migrations/0_init_foundation/migration.sql#L2-L3)
* **What is Wrong:**
  The baseline Prisma migration executes:
  ```sql
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS "postgis";
  ```
  On AWS RDS PostgreSQL, standard application users (e.g., `vit_carpool_user`) do not have superuser privileges and cannot execute `CREATE EXTENSION`.
* **Why it Matters:** If `DATABASE_URL` is configured with an unprivileged database user, running `npx prisma migrate deploy` on a fresh database will crash with:
  `ERROR: permission denied to create extension "postgis"`.
* **Recommended Correction:**
  Document in the operational setup runbook that the RDS master user (`postgres`) must connect *once* upon database creation and pre-install the extensions:
  ```sql
  \c vit_carpool_prod
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS "postgis";
  GRANT ALL ON ALL TABLES IN SCHEMA public TO vit_carpool_user;
  ```
* **Action Required:** AWS Operational Runbook.

---

### Area 6: Production Configuration & Routing Architecture

#### Finding 6.1: Missing Production Environment Variables in `.env.production.example` Causes Startup Crash
* **Severity:** **CRITICAL (SHOWSTOPPER)**
* **File & Lines:** [`.env.production.example`](file:///Users/rohan/Vit-Carpool/.env.production.example), [`apps/api/src/config/env.validation.ts#L138-L177`](file:///Users/rohan/Vit-Carpool/apps/api/src/config/env.validation.ts#L138-L177)
* **What is Wrong:**
  [`env.validation.ts`](file:///Users/rohan/Vit-Carpool/apps/api/src/config/env.validation.ts) enforces four strict Zod validation refinements when `NODE_ENV === 'production'`:
  1. `LOCATION_PROVIDER` cannot be `'mock'`. It requires `LOCATION_PROVIDER=mapbox` and a non-empty `MAPBOX_ACCESS_TOKEN`.
  2. Both `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` must be configured and form a valid matching RS256 RSA keypair.
  3. `OTP_HMAC_SECRET` must be configured with a minimum of 16 characters.
  
  In [`.env.production.example`](file:///Users/rohan/Vit-Carpool/.env.production.example):
  - `LOCATION_PROVIDER` and `MAPBOX_ACCESS_TOKEN` were **completely missing** (defaulting to `'mock'`).
  - `JWT_SECRET` was provided instead of `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY`.
  - `OTP_HMAC_SECRET` was **completely missing**.
* **Why it Matters:**
  When the API container launches with `.env.production`, NestJS runs `validateEnv()`.
  Zod validation fails on lines 140, 155, and 174.
  **The container crashes immediately upon startup (`process.exit(1)`) with `EnvValidationError`.**
* **Recommended Correction:**
  Update `.env.production.example` to provide complete, accurate templates for:
  - `LOCATION_PROVIDER=mapbox` and `MAPBOX_ACCESS_TOKEN=pk.eyJ1...`
  - `JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."`
  - `JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."`
  - `OTP_HMAC_SECRET=CHANGE_ME_MIN_16_CHAR_HMAC_SECRET`
* **Action Required:** Configuration update (`.env.production.example`).

#### Finding 6.2: Caddy Ingress Routing Mismatch Breaks 100% of Core REST Endpoints
* **Severity:** **CRITICAL (SHOWSTOPPER)**
* **File & Lines:** [`Caddyfile#L27-L58`](file:///Users/rohan/Vit-Carpool/Caddyfile#L27-L58), [`apps/web/vite.config.ts#L25-L51`](file:///Users/rohan/Vit-Carpool/apps/web/vite.config.ts#L25-L51), [`apps/api/src/main.ts#L1-L69`](file:///Users/rohan/Vit-Carpool/apps/api/src/main.ts#L1-L69)
* **What is Wrong:**
  In NestJS backend, controllers do **not** have a global `/api` prefix. They are defined as:
  - `@Controller('rides')`, `@Controller('bookings')`, `@Controller('vehicles')`, `@Controller('chat')`, `@Controller('notifications')`, `@Controller('ratings')`, `@Controller('moderation')`, `@Controller('users')`, `@Controller('verification')`, etc.
  
  In `apps/web/src/`, frontend fetch calls use a mix of styles:
  - Some endpoints call `/api/vehicles`, `/api/verification/request`, `/api/admin/overview`.
  - Many endpoints call root routes directly: `/bookings/mine`, `/rides`, `/chat/conversations`, `/notifications`, `/ratings`, `/moderation/reports`, `/users/me/avatar`.

  In local development, `apps/web/vite.config.ts` handled this by explicitly proxying every individual route (`/rides`, `/bookings`, etc.) to `localhost:3000`, AND rewriting `/api/*` to strip `/api`.
  
  **In `Caddyfile`:**
  ```caddyfile
  @api_routes path /api* /health /uploads*
  handle @api_routes {
      reverse_proxy api:3000
  }
  handle {
      reverse_proxy web:8080
  }
  ```
  1. Requests to `/bookings/mine`, `/rides`, `/chat/conversations`, `/notifications` do NOT match `@api_routes`. Caddy sends them to `web:8080` (Nginx). Nginx returns `index.html` (HTTP 200). In React, `res.json()` fails with:
     `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
  2. Requests to `/api/vehicles` match `@api_routes` and are sent to NestJS *with the `/api` prefix intact*. NestJS has no `@Controller('api/vehicles')`, returning `404 Cannot GET /api/vehicles`.
* **Why it Matters:** **Virtually zero frontend operations work in production.** Every ride search, booking approval, private chat message, and avatar upload fails.
* **Recommended Correction:**
  1. In `apps/api/src/main.ts`, add `app.setGlobalPrefix('api', { exclude: ['health'] })` so that all backend REST endpoints are uniformly rooted under `/api/`.
  2. In `apps/web/src/`, ensure all API service calls consistently use `/api/...` endpoints.
  3. In `Caddyfile`, update `@api_routes` to proxy all backend controller route families:
     ```caddyfile
     @api_routes path /api* /health /uploads* /rides* /bookings* /chat* /notifications* /vehicles* /ratings* /moderation* /users* /verification* /recurring-commutes* /ride-alerts* /auth* /locations*
     ```
* **Action Required:** Code changes (`apps/api/src/main.ts`) + Caddy configuration.

#### Finding 6.3: Public `/health` Endpoint Discloses Database Topology and Software Versions
* **Severity:** **LOW**
* **File & Lines:** [`apps/api/src/modules/health/health.service.ts#L65-L72`](file:///Users/rohan/Vit-Carpool/apps/api/src/modules/health/health.service.ts#L65-L72), [`apps/api/src/modules/health/health.controller.ts#L15`](file:///Users/rohan/Vit-Carpool/apps/api/src/modules/health/health.controller.ts#L15)
* **What is Wrong:**
  `HealthController.getHealth()` is `@Public()` and returns:
  ```json
  {
    "status": "ok",
    "database": {
      "connected": true,
      "databaseName": "vit_carpool_prod",
      "postgisVersion": "3.4.2 ...",
      "latencyMs": 3
    }
  }
  ```
  And when the database is down, it returns `status: "down"` with **HTTP 200 OK** rather than HTTP 503.
* **Why it Matters:** Exposing the internal database catalog name and exact PostGIS version aids attackers in vulnerability profiling. Returning HTTP 200 during database outages tricks Docker and AWS ALB health monitors into declaring an unhealthy container "healthy".
* **Recommended Correction:**
  1. Return HTTP 503 (`HttpStatus.SERVICE_UNAVAILABLE`) when `database.connected === false`.
  2. Exclude internal database names and version strings from unauthenticated public health responses.
* **Action Required:** Code changes.

#### Finding 6.4: Phantom Environment Variable `ADMIN_BOOTSTRAP_SECRET`
* **Severity:** **LOW / HYGIENE**
* **File & Lines:** [`.env.production.example#L95`](file:///Users/rohan/Vit-Carpool/.env.production.example#L95), [`packages/db/scripts/bootstrap-super-admin.ts#L1-L109`](file:///Users/rohan/Vit-Carpool/packages/db/scripts/bootstrap-super-admin.ts#L1-L109)
* **What is Wrong:** `.env.production.example` documents `ADMIN_BOOTSTRAP_SECRET`. No such variable exists anywhere in the codebase. Admin elevation is handled strictly via CLI script `pnpm bootstrap:super-admin --email <user> --reason <reason>`.
* **Recommended Correction:** Remove `ADMIN_BOOTSTRAP_SECRET` from `.env.production.example` and replace it with documentation pointing to the CLI bootstrap script.
* **Action Required:** Documentation cleanup.

---

### Area 7: Domain Independence

#### Finding 7.1: Hardcoded Domain Names Throughout Configuration
* **Severity:** **MEDIUM**
* **File & Lines:**
  - [`Caddyfile#L8`](file:///Users/rohan/Vit-Carpool/Caddyfile#L8): `email {$ACME_EMAIL:admin@vitcarpool.com}`
  - [`.env.production.example#L18`](file:///Users/rohan/Vit-Carpool/.env.production.example#L18): `CORS_ORIGIN=https://vitcarpool.com,https://www.vitcarpool.com`
  - [`.env.production.example#L26`](file:///Users/rohan/Vit-Carpool/.env.production.example#L26): `APP_DOMAIN=vitcarpool.com`
  - [`.env.production.example#L78`](file:///Users/rohan/Vit-Carpool/.env.production.example#L78): `SMTP_FROM="VIT Carpool <noreply@vitcarpool.com>"`
  - [`apps/api/src/config/env.validation.ts#L63`](file:///Users/rohan/Vit-Carpool/apps/api/src/config/env.validation.ts#L63): `JWT_ISSUER: z.string().default('https://api.vitcarpool.app/auth/v1')`
* **What is Wrong:** The configuration assumes the final production domain is already registered and active as `vitcarpool.com`.
* **Why it Matters:** If the team deploys initially on an alternate domain (e.g. `vitcarpool.in`, `carpool.vit.ac.in`, or a dynamic AWS EC2 DNS name), CORS checks will fail, Caddy certificate issuance will fail, and email sender verification will fail.
* **Recommended Correction:** Parameterize all domain references through `APP_DOMAIN` in `.env.production` and construct `CORS_ORIGIN`, `SMTP_FROM`, and `Caddyfile` dynamically.
* **Action Required:** Configuration update.

---

### Area 8: Testing Reality vs Mocked Behavior

#### Finding 8.1: Production S3 and WebSocket Cloudflare Edge Behavior Have Never Been Tested
* **Severity:** **HIGH**
* **File & Lines:** [`apps/api/test/s3-storage.e2e-spec.ts#L101-L105`](file:///Users/rohan/Vit-Carpool/apps/api/test/s3-storage.e2e-spec.ts#L101-L105), [`apps/api/test/tracking-gateway-backend.e2e-spec.ts`](file:///Users/rohan/Vit-Carpool/apps/api/test/tracking-gateway-backend.e2e-spec.ts)
* **What is Wrong:**
  1. In `s3-storage.e2e-spec.ts`, the S3 client is mocked via `jest.spyOn((service as any).s3Client, 'send')`. No real HTTP requests were ever made to AWS S3 or LocalStack. S3 bucket policies, IAM role authorization, presigned URL expiration, and CORS behavior remain completely untested against live infrastructure.
  2. The Socket.io tracking gateway test runs in-process via Node HTTP server. WebSocket streaming through Caddy behind Cloudflare edge proxies has never been tested end-to-end.
  3. No multi-container end-to-end tests (Nginx + NestJS + Postgres + Caddy) have ever been run in Docker Compose.
* **Why it Matters:** Relying on unit tests that pass with mocks creates false confidence while masking real infrastructure failure modes.
* **Recommended Correction:**
  1. Execute a staging smoke test using Docker Compose with real container networking before going live.
  2. Verify WebSocket connection persistence over HTTPS/WSS with Cloudflare proxy enabled.
* **Action Required:** Staging verification tests.

---

## Action Plan & Phased Prioritization

### 1. Critical Blockers Before AWS Provisioning
*These issues must be resolved in code and configuration before creating any AWS infrastructure:*

1. **Resolve Express Trust Proxy Bug (Finding 2.1):** Update `apps/api/src/main.ts` so `TRUST_PROXY=2` is parsed as an integer, preventing campus-wide rate-limit lockouts.
2. **Correct Production Environment Variables (Finding 6.1):** Update `.env.production.example` to require `LOCATION_PROVIDER=mapbox`, `MAPBOX_ACCESS_TOKEN`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, and `OTP_HMAC_SECRET`.
3. **Harmonize API Routing & Ingress (Finding 6.2):** Reconcile frontend fetch URLs, NestJS route controllers, and `Caddyfile` reverse proxy matchers so API requests reach the backend and are not eaten by Nginx.
4. **Move Prisma to Dependencies (Finding 3.1):** Move `"prisma": "^5.22.0"` to `"dependencies"` in `packages/db/package.json` so `prisma migrate deploy` functions in pruned production containers.
5. **Decouple Domain Names (Finding 7.1):** Ensure all domain references rely on the `APP_DOMAIN` environment variable rather than hardcoded `vitcarpool.com`.

---

### 2. Blockers Before First Production Deployment
*These operational tasks must be completed during the initial AWS setup:*

1. **Pre-Create PostGIS Extensions on RDS (Finding 5.1):** Connect as master user `postgres` and run `CREATE EXTENSION postgis; CREATE EXTENSION "uuid-ossp";` before running Prisma migrations.
2. **Implement Secret Retrieval Automation (Finding 4.1):** Create `scripts/fetch-secrets-from-ssm.sh` so production secrets are securely populated from AWS SSM Parameter Store onto EC2.
3. **Resolve CI/CD Ingress Architecture (Finding 4.2):** Switch deployment dispatch from direct SSH (port 22) to AWS SSM Run Command, or implement dynamic runner IP whitelisting.
4. **Restrict Inbound Web Ports to Cloudflare (Finding 2.2):** Lock down EC2 Security Group ports 80/443 strictly to Cloudflare edge IP prefixes to prevent direct-origin IP spoofing.
5. **S3 Upload Migration Script (Finding 1.1):** Provide `scripts/migrate-uploads-to-s3.ts` to sync existing avatars/vehicle photos to the S3 bucket during cutover.

---

### 3. Issues That Can Safely Wait Until After Launch
*Non-critical hygiene tasks that can be scheduled for post-launch sprint:*

1. **Automated Zero-Downtime Blue/Green Swapping (Finding 3.2):** A 10-second maintenance cutover window during initial pre-launch deployment is acceptable for Day 1. Full blue-green container rotation can follow in Phase 2.
2. **Orphaned Local Disk File Deletion (Finding 1.2):** Local files left on the EC2 EBS volume consume minimal disk space (<50 MB) and can be cleaned up post-launch.
3. **Public Health Endpoint Hardening (Finding 6.3):** Redacting database names and PostGIS versions from `/health` is a security-in-depth improvement that does not block functionality.
4. **Automated Verification Document S3 Purge (Finding 1.3):** Verification proof document uploads are not currently exposed in the active UI, so S3 purge enhancements can follow in Milestone 8.

---

## Final Honest Readiness Assessment

| Evaluation Dimension | Rating | Verdict |
| :--- | :--- | :--- |
| **Codebase Architecture & Logic** | **8.5 / 10** | Strong foundation, comprehensive features, clean monorepo structure. |
| **Containerization & Docker Packaging** | **8.0 / 10** | Multi-stage builds are lightweight and secure; needs Prisma dependency adjustment. |
| **Configuration & Secret Preparedness** | **3.0 / 10** | **FAIL**: Key Zod production variables missing; would crash on startup. |
| **Network & Ingress Routing** | **2.0 / 10** | **FAIL**: Caddy ingress rules mismatch frontend paths; Express trust proxy type bug triggers global rate-limit lockout. |
| **Operational & Deployment Safety** | **5.0 / 10** | Migrations lack automated rollback; SSH firewall deadlock in CI/CD. |
| **OVERALL PRODUCTION READINESS** | **NOT READY** | **DO NOT PROVISION OR DEPLOY UNTIL CRITICAL BLOCKERS ARE RESOLVED.** |

### Recommendation
**Do not execute any cloud provisioning commands, spend AWS credits, or trigger GitHub Actions deployments at this time.**

Proceed immediately with fixing the **5 Critical Pre-Provisioning Blockers** in the codebase. Once those code and configuration changes are in place and verified via end-to-end container integration testing, the platform will be genuinely ready for safe, reliable AWS production hosting.

