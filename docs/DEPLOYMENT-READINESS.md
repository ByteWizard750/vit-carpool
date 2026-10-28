# VIT Carpool — Production Deployment Readiness & Operations Guide

## 1. Executive Summary & Production Readiness Verdict

> [!WARNING]
> **Production Readiness Status: CONDITIONALLY READY FOR STAGING / NOT READY FOR UNATTENDED PRODUCTION**
> 
> The core application code, database schema, domain invariants, security guardrails, cohort isolation, and automated test suites have achieved **100% compliance** across all functional user journeys (Journeys A through G). However, the application **must not be deployed to public production** until the external infrastructure dependencies (Production PostgreSQL + PostGIS, Remote Object Storage for verification documents, dedicated transactional SMTP, and distributed Redis rate limiting) are provisioned and configured according to the requirements detailed in this document.

---

## 2. Infrastructure & Database Architecture

### 2.1 PostgreSQL & PostGIS Requirements
* **Engine**: PostgreSQL 16+ with PostGIS 3.4+.
* **Extensions**:
  ```sql
  CREATE EXTENSION IF NOT EXISTS postgis;
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  ```
* **Spatial Data Types & Indexes**:
  * The application relies on `geometry(Point, 4326)` for geographic points (origin, destination, ride alerts) and `geometry(LineString, 4326)` for corridor matching.
  * Spatial queries use PostGIS functions: `ST_DWithin`, `ST_DistanceSphere`, `ST_MakePoint`, `ST_SetSRID`.
  * Ensure GiST indexes are present on all spatial columns:
    * `idx_rides_origin_geom` on `rides(origin_point)`
    * `idx_rides_destination_geom` on `rides(destination_point)`
    * `idx_ride_alerts_origin_geom` on `ride_alerts(origin_point)`
    * `idx_ride_alerts_dest_geom` on `ride_alerts(destination_point)`

### 2.2 Database Migrations & Runtime Privileges
* **Migration Runner**:
  * Migrations must be executed during CI/CD deployment or entrypoint container initialization via:
    ```bash
    pnpm --filter @vit-carpool/db prisma migrate deploy
    ```
  * Never use `prisma db push` or `prisma migrate reset` in staging or production.
* **Least-Privilege Database Roles**:
  * **Migration User** (`carpool_migrator`): Member of `carpool_admin`. Has `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, `DROP TABLE` (strictly used during deployment pipeline).
  * **Application Runtime User** (`carpool_app`):
    ```sql
    GRANT CONNECT ON DATABASE vit_carpool_prod TO carpool_app;
    GRANT USAGE ON SCHEMA public TO carpool_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO carpool_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO carpool_app;
    -- Explicitly REVOKE destructive DDL privileges:
    REVOKE DROP, TRUNCATE ON ALL TABLES IN SCHEMA public FROM carpool_app;
    ```
* **Connection Pooling**:
  * When deploying to serverless or containerized environments (e.g. AWS ECS, GCP Cloud Run, Kubernetes), configure **PgBouncer** or Supabase Transaction Pooler.
  * `DATABASE_URL` for application runtime should target the pooled transaction port (e.g. port 6543).
  * Direct port (5432) must be reserved exclusively for migration runs (`DIRECT_URL`).

---

## 3. Cryptographic Authentication & Key Management

### 3.1 Custom RS256 Asymmetric JWT Session Authentication
The VIT Carpool platform utilizes custom RS256 asymmetric cryptographic tokens for all user sessions:
* **Private Key** (`JWT_PRIVATE_KEY`): Used exclusively by the NestJS Auth module to sign valid session tokens upon OTP verification.
* **Public Key** (`JWT_PUBLIC_KEY`): Used to verify signature validity. Also exposed as an RFC 7517 compliant JWKS endpoint at `/.well-known/jwks.json` and `/auth/v1/.well-known/jwks.json`.
* **Key Generation**:
  ```bash
  # Generate 2048-bit RSA private key
  openssl genrsa -out jwt_private.pem 2048
  # Extract public key in PEM format
  openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem
  ```
* **Storage & Secret Injection**:
  * Never commit private or public keys to Git.
  * In production, inject keys as base64-encoded strings or multi-line PEM via AWS Secrets Manager, GCP Secret Manager, or Doppler.
* **Key Rotation**:
  * The `JWT_KEY_ID` (kid) is attached to token headers. Rotate keys by updating `JWT_PRIVATE_KEY` and adding previous keys to JWKS with unique `kid` identifiers.

### 3.2 Keyed HMAC Secret for OTP Verification
* **Secret** (`OTP_HMAC_SECRET`):
  * Used to compute cryptographically secure HMAC-SHA256 hashes of 6-digit OTP codes and store verifiers in the database without storing raw codes.
  * Minimum requirement: 32 random bytes (e.g. `openssl rand -hex 32`).
* **OTP Expiration**:
  * Codes expire after 10 minutes.
  * Automated background cleanup purges expired OTP verifiers every 30 minutes (`OTP_CLEANUP_INTERVAL_MS=1800000`).

---

## 4. SMTP Credentials & Institutional Mail Delivery

* **Configuration**:
  * `SMTP_HOST`: `smtp.gmail.com` or dedicated transactional provider (e.g. `smtp.sendgrid.net`, `email-smtp.ap-south-1.amazonaws.com`).
  * `SMTP_PORT`: `465` (SSL) or `587` (TLS).
  * `SMTP_SECURE`: `true` for 465, `false` for 587.
  * `SMTP_USER` / `SMTP_PASS`: Institutional relay or application password.
  * `SMTP_FROM`: `"VIT Carpool <vitcarpool.app@gmail.com>"`.
* **Deliverability Requirements**:
  * For emails sent to `@vitstudent.ac.in` and `@vit.ac.in`, DNS records must be configured:
    * **SPF**: Ensure sending IP is authorized in domain SPF record.
    * **DKIM**: 2048-bit cryptographic DKIM signature on all outgoing verification emails.
    * **DMARC**: Strict or quarantine policy to prevent spoofing.

---

## 5. Reverse Proxy, Networking & Rate Limiting

### 5.1 Reverse Proxy & IP Resolution
* When deployed behind Nginx, AWS Application Load Balancer (ALB), or Cloudflare:
  * Configure `TRUST_PROXY=1` (or specify trusted CIDR blocks) so Express accurately extracts the client IP address from `X-Forwarded-For`.
  * Ensure proxy strips spoofed `X-Forwarded-For` headers from untrusted clients.

### 5.2 Rate Limiting
* **Current Implementation**:
  * In-memory token bucket rate limiting on sensitive authentication routes (`AUTH_RATE_LIMIT_TTL=60`, `AUTH_RATE_LIMIT_LIMIT=10`).
* **Multi-Instance Production Requirement**:
  * In a multi-replica container deployment, in-memory rate limiting operates per-instance.
  * Deploy a centralized Redis cache (`@nestjs/throttler` with Redis storage) or configure upstream rate limiting at the Cloudflare / WAF layer.

### 5.3 CORS Configuration
* `CORS_ORIGIN`: Must strictly equal the production frontend domain (e.g. `https://vitcarpool.app`).
* Wildcard `*` is strictly disallowed as authentication requires credentials / bearer tokens.

---

## 6. Verification Document Storage & Automated Retention

### 6.1 Remote Object Storage
* **Current Development State**: Local database byte storage / local uploads.
* **Production Requirement**:
  * Integration with private AWS S3 / Cloudflare R2 bucket.
  * Files must be stored with private ACLs; downloads must use short-lived presigned URLs (max 15-minute TTL) accessible only by verified administrators.

### 6.2 Document Retention Policy
* **Regulatory Compliance**: Institutional identity documents must not be retained indefinitely.
* **Automated Purge Service** (`AutomatedDocumentRetentionService`):
  * Automatically purges identity verification documents and metadata 30 days after verification approval or rejection.
  * In production, verify that the remote object storage deletion is triggered concurrently with the database purge.

---

## 7. Scheduler Lifecycle & Concurrency Invariants

### 7.1 Recurring Commute Materialization
* **Scheduler**:
  * `RecurringCommutesCronService` executes on a daily cron schedule (`0 5 0 * * *` — 00:05 IST).
  * Generates ride occurrences for the next 14-day rolling window in `Asia/Kolkata` time (+05:30).
* **Duplicate Execution Prevention**:
  * Database constraint `UNIQUE (recurring_commute_id, scheduled_occurrence)` prevents duplicate rides from being created even if multiple scheduler workers fire concurrently.
  * For multi-instance deployments, utilize PostgreSQL advisory locks (`pg_try_advisory_xact_lock`) to ensure only one worker performs generation per cycle.

---

## 8. Logging, Monitoring & Disaster Recovery

### 8.1 Logging
* Structured JSON logging to `stdout` capturing:
  * Timestamp (ISO-8601 UTC)
  * Trace ID / Request Correlation ID
  * Actor ID and Actor Role (excluding PII)
  * Action and Target
* Mask sensitive fields (`password`, `otp`, `privateKey`, `token`) in all loggers.

### 8.2 Health Checks & Graceful Shutdown
* **Health Check Endpoint**: `/health` checking:
  * PostgreSQL connection pool health
  * PostGIS spatial query responsiveness
  * Disk space / memory thresholds
* **Graceful Shutdown**:
  * `app.enableShutdownHooks()` ensures NestJS closes database connections and drains in-flight HTTP requests upon `SIGTERM` / `SIGINT`.

### 8.3 Backups & Disaster Recovery
* **RPO (Recovery Point Objective)**: <= 1 hour.
* **RTO (Recovery Time Objective)**: <= 4 hours.
* **Strategy**:
  * Daily full automated database snapshot.
  * Continuous WAL archiving for Point-In-Time Recovery (PITR) up to 14 days.
  * Monthly disaster recovery drill restoring snapshot to staging database.

---

## 9. Environment Variable Specification

| Variable | Description | Production Requirement | Example / Format |
|---|---|---|---|
| `NODE_ENV` | Environment identifier | `production` | `production` |
| `PORT` | API server listen port | `3000` | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | Required (SSL enabled) | `postgresql://user:pass@host:6543/db?sslmode=require` |
| `DIRECT_URL` | Non-pooled connection for migrations | Required for Prisma Migrate | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `CORS_ORIGIN` | Allowed web frontend origin | Required (Exact domain) | `https://vitcarpool.app` |
| `VITE_API_BASE_URL` | Public API URL for web app | Required | `https://api.vitcarpool.app` |
| `JWT_PRIVATE_KEY` | RS256 RSA private key | Required (PEM / base64) | Secret |
| `JWT_PUBLIC_KEY` | RS256 RSA public key | Required (PEM / base64) | Public PEM string |
| `JWT_KEY_ID` | Key identifier for JWKS | Required | `vit-carpool-key-2026-v1` |
| `JWT_ISSUER` | Token issuer URL | Required | `https://api.vitcarpool.app/auth/v1` |
| `JWT_AUDIENCE` | Token audience | `authenticated` | `authenticated` |
| `OTP_HMAC_SECRET` | Secret for OTP HMAC verification | Required (32+ bytes) | Random hex/base64 string |
| `SMTP_HOST` | Transactional email SMTP host | Required | `smtp.sendgrid.net` |
| `SMTP_PORT` | SMTP port | Required | `465` or `587` |
| `SMTP_SECURE` | SSL toggle for SMTP | Required | `true` (465) or `false` (587) |
| `SMTP_USER` | SMTP username | Required | `apikey` |
| `SMTP_PASS` | SMTP password / API token | Required | Secret API Key |
| `SMTP_FROM` | Sender address | Required | `"VIT Carpool" <no-reply@vitcarpool.app>` |
| `STUDENT_EMAIL_REGEX` | Regex for student verification | Default verified | `^[a-zA-Z0-9._%+-]+@vitstudent\.ac\.in$` |
| `FACULTY_EMAIL_REGEX` | Regex for faculty verification | Default verified | `^[a-zA-Z0-9._%+-]+@vit\.ac\.in$` |
| `TRUST_PROXY` | Reverse proxy hop count / CIDR | Required behind proxy | `1` or `true` |
