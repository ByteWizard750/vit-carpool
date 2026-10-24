# Architecture Decision Records & Unresolved Decisions Log

This document tracks all formal architectural decisions (ADRs) as well as the active registry of unresolved questions and risk factors that require confirmation.

---

## 1. Settled Architecture Decision Records (ADRs)

### ADR-001: Modular Monolith Architecture
* **Status**: Accepted
* **Context**: The platform is built and maintained by a solo developer. Microservices introduce complex service discovery, network latency, distributed transactions, and high operational overhead.
* **Decision**: Adopt a modular monolith backend in NestJS with clean domain boundaries (`auth`, `users`, `vehicles`, `rides`, `bookings`, `alerts`, `notifications`, `geo`).
* **Consequences**: Easy local development, zero inter-service network latency, atomic transactions within PostgreSQL, and straightforward deployment.

### ADR-002: Progressive Web App (PWA) Mobile-First Strategy
* **Status**: Accepted
* **Context**: Developing, maintaining, and deploying separate iOS, Android, and web codebases is impractical for a solo engineer and delays user feedback.
* **Decision**: Build a single responsive web application (React 19 + Vite + TypeScript) with a PWA manifest, service worker caching, and touch-optimized mobile interfaces.
* **Consequences**: Immediate deployment without App Store / Play Store approval delays, single codebase to maintain, universal accessibility across devices.

### ADR-003: PostgreSQL + PostGIS with pg-boss for Jobs
* **Status**: Accepted
* **Context**: Adding Redis solely for queuing introduces extra monthly hosting expenses and another failure mode. Geospatial candidate matching is performance-critical.
* **Decision**: Use PostgreSQL 16+ as the single data store, with PostGIS for spatial queries and `pg-boss` for transactional asynchronous job queues.
* **Consequences**: Zero added database infrastructure costs, transactional job enqueuing alongside database updates, robust spatial indexing via GIST.

### ADR-004: Supabase Auth with Server-Side JWT Verification
* **Status**: Accepted
* **Context**: Building custom authentication (password hashing, email delivery, rate limiting, token refresh) is error-prone and insecure.
* **Decision**: Use Supabase Auth for identity generation and email verification, while verifying JWTs server-side in NestJS against authoritative database user records. The client runtime is never trusted for audience or roles.
* **Consequences**: Free-tier authentication with high security, decoupled from the main backend logic.

### ADR-005: Configurable Institutional Email Verification, Safe Failover & Privacy Retention
* **Status**: Accepted (Revised for Milestone 2.1)
* **Context**:
  * Observed VIT Chennai examples:
    * Student example: `rayavarapu.rohan2023@vitstudent.ac.in` (indicates `vitstudent.ac.in` domain with username containing name and admission year).
    * Faculty/proctor example: `renukadevi.r@vit.ac.in` (indicates `vit.ac.in` domain with staff username format).
  * These observed domains are initial examples and not yet confirmed universal rules.
* **Decision**:
  1. **Configurable & Disabled by Default**: Pattern matchers (`STUDENT_EMAIL_REGEX`, `FACULTY_EMAIL_REGEX`) are managed via environment variables. Automatic classification is governed by `ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION`, which remains `false` by default until confirmed.
  2. **Fail-Safe Classification**:
     * If automatic verification is disabled: all accounts initialize as `PENDING` with `audience = NULL`.
     * If enabled: an account is auto-verified ONLY if it matches exactly ONE rule with zero ambiguity. If it matches both, neither, or an inactive pattern, it fails safe to `PENDING` with `audience = NULL`.
     * An institutional email domain NEVER grants `ADMIN` role privileges.
  3. **Separation of Audience from Account Status**:
     * A user's `audience` (`STUDENT` or `FACULTY`) is assigned upon verification and represents their campus community affiliation.
     * If a verified user is `SUSPENDED`, they retain their audience identity in the database to preserve historical integrity, but their `verification_status = 'SUSPENDED'` locks them out of all protected operations.
  4. **Controlled Email Mutation & Re-Verification**:
     * Changing an email in Supabase Auth or upstream identity triggers a controlled identity re-verification event.
     * The account transitions to `PENDING` re-verification; a user is NEVER transferred between student and faculty groups merely by editing their email.
     * All email changes are recorded transactionally in `audit_logs`.
  5. **Controlled Manual Verification Fallback & Privacy Retention**:
     * Unmatched users submit campus ID proof to a private bucket (`id-documents`).
     * Zero public access; accessible only via short-lived server-signed URLs (15 min TTL) by authorized `ADMIN` reviewers.
     * **Retention Policy**: ID document files must be permanently purged within 30 days of the verification decision (`APPROVED` or `REJECTED`).
  6. **Transactional Audit Logging**:
     * All status changes, audience assignments, and email updates are written transactionally in the same database transaction.
     * The application database role is restricted from `UPDATE` and `DELETE` on `audit_logs` via triggers and privilege controls.
* **Consequences**: Zero risk of role spoofing, total resilience to pattern ambiguities, and strong compliance with privacy data minimization principles.

### ADR-006: Authoritative Case-Insensitive Email Uniqueness via Storage-Layer Constraint
* **Status**: Accepted
* **Context**: Prisma 5.22.0 does not natively represent expression indexes like `CREATE UNIQUE INDEX ... ON users(LOWER(email))`. Creating such an index via custom migrations while simultaneously having `@unique` on `email` in Prisma produces duplicate indexes and causes schema-diffing friction in future Prisma migrations.
* **Decision**:
  1. Define `email String @unique @db.VarChar(255)` in `schema.prisma` so Prisma natively generates standard unique indexes and full TypeScript client query support (`prisma.user.findUnique({ where: { email } })`).
  2. Enforce case-insensitivity authoritatively at the database storage layer via check constraint: `ALTER TABLE users ADD CONSTRAINT chk_users_email_lowercase CHECK (email = LOWER(email))`.
  3. Require strict lowercase transformation at all application boundaries (NestJS DTO validation pipes, Supabase auth synchronization, manual review inputs): `email = email.trim().toLowerCase()`.
  4. Apply the identical check constraint to `verification_requests`: `CHECK (institutional_email = LOWER(institutional_email))`.
* **Consequences**: Zero duplicate indexes, zero Prisma migration diffing conflicts, and bulletproof database-level prevention of case-spoofing duplicates (e.g. `User@vit.ac.in` vs `user@vit.ac.in`).

### ADR-007: Audit Log Actor Decoupling from Foreign Key Actions for Immutability
* **Status**: Accepted
* **Context**: Adding an `ON DELETE SET NULL` foreign key constraint from `audit_logs.actor_id` to `users(id)` directly conflicts with the `trg_audit_log_immutable` trigger, which strictly forbids `UPDATE` or `DELETE` on `audit_logs`. If a user is deleted or anonymized (e.g., GDPR Right to Erasure), PostgreSQL attempts to update `actor_id` to `NULL`, triggering an exception and blocking the operation entirely.
* **Decision**:
  1. Define `actor_id UUID` as a standalone column in `audit_logs` **without** a cascading foreign key constraint (`ON DELETE SET NULL` or `CASCADE`).
  2. Retain `trg_audit_log_immutable` to strictly enforce append-only immutability.
  3. When an account is deleted or anonymized, personal identifying fields are purged from `users` and storage buckets, while historical `audit_logs` rows remain unchanged as an immutable security ledger.
  4. In administrative UI/reporting queries, actor details are fetched via left joins or application-layer lookup, displaying "Former / Anonymized User" when the actor record no longer exists.
* **Consequences**: Resolves the database trigger collision, preserves non-repudiation of security events, and complies with privacy regulations by allowing user personal data deletion without tampering with audit logs.

### ADR-008: Database Role Separation, Table Ownership & Out-of-Migration Provisioning
* **Status**: Accepted
* **Context**: Embedding role creation (`CREATE ROLE app_user WITH PASSWORD '...'`) inside application Prisma migrations introduces hardcoded credentials, couples migrations to local PostgreSQL, and risks failures in hosted Supabase environments where roles are managed by the platform.
* **Decision**:
  1. Separate role bootstrap completely from application schema migrations. Local Docker role creation is isolated to `docker/postgres/init-databases.sh`, reading passwords securely from environment variables (`DATABASE_APP_USER_PASSWORD`). In hosted Supabase, platform roles (`postgres`, `service_role`, `authenticated`) are managed via project settings/vault.
  2. Table ownership belongs exclusively to the migration role (`postgres` / `migrator`). The application connection pool connects under the runtime role (`app_user`), which is a **non-owner**.
  3. Because the runtime role is a non-owner, it is physically prohibited by PostgreSQL from altering tables or executing `DISABLE TRIGGER` on `trg_audit_log_immutable`.
  4. Revoke `CREATE` on schema public (`REVOKE CREATE ON SCHEMA public FROM app_user`) to prevent runtime role from creating shadow objects. Omit direct `EXECUTE` grants on trigger functions.
  5. Test effective permissions using the actual runtime role connection.
* **Consequences**: Secure credential management, cloud-agnostic migration files, and bulletproof non-owner immutability enforcement.

### ADR-009: Webhook Reconciliation, Sequence Tracking & Authoritative Ambiguity Resolution
* **Status**: Accepted
* **Context**: Asynchronous webhooks from Supabase Auth (`user.updated`) may arrive out-of-order, be duplicated, or deliver events with identical timestamps but conflicting emails (e.g. rapid edits or clock truncations). Relying on timestamps alone can result in race conditions or overwriting authoritative identity states.
* **Decision**:
  1. Track `auth_updated_at` in the `users` table and acquire row locks (`SELECT FOR UPDATE`) during reconciliation.
  2. Drop incoming events with older timestamps as stale (idempotent no-op).
  3. If an incoming event has a timestamp identical to local state but conflicting email, treat it as an **ambiguous event conflict**. The backend executes an authoritative server-to-server call: `supabase.auth.admin.getUserById(auth_user_id)`.
  4. Local state is reconciled strictly against the authoritative Supabase Auth response. If the email changed, `verification_status` transitions to `PENDING`, `verified_at` is cleared to `NULL`, and the user's verified `audience` is retained.
  5. Carpooling access remains strictly revoked throughout any ambiguous or pending state until re-verification is complete.
* **Consequences**: Eliminates race conditions, ensures absolute consistency with the authentication provider, and maintains access revocation invariants.

### ADR-010: Migration Recovery Strategy, Forward-Fix Principle & Data Preservation
* **Status**: Accepted
* **Context**: Prisma Migrate operates forward-only and does not automatically execute companion `down.sql` scripts. Promising automatic rollback of irreversible schema or audit operations is unsafe in production environments.
* **Decision**:
  1. Acknowledge that Prisma Migrate does not support automatic down-migrations. Version-controlled `down.sql` scripts serve as human-reviewed emergency runbooks for manual execution via `psql`.
  2. For staging/production environments with live user or audit data, adopt the **Forward-Fix Principle**: resolve migration failures by authoring and deploying a forward-fixing migration script (`<timestamp>_fix_<issue>/migration.sql`), followed by `prisma migrate resolve`.
  3. Enforce the **Data Preservation Invariant**: Recovery scripts must never execute destructive drops (`DROP TABLE users; DROP TABLE audit_logs;`) on databases containing active data.
  4. In production, require validated pre-migration point-in-time recovery (PITR) snapshots rather than relying on schema undo scripts.
* **Consequences**: Transparent, realistic operational runbooks that eliminate the risk of accidental data loss during schema evolution.

---

## 2. Unresolved Decisions & Open Questions Log

| # | Question & Description | Why It Matters | Available Options | Confirmed Direction / Decision | Blocks Implementation? | Owner / Confirming Party |
|---|------------------------|----------------|-------------------|--------------------------------|------------------------|--------------------------|
| **D-01** | **Institutional Email Domain Patterns**:<br/>What exact email patterns differentiate students vs. faculty at VIT Chennai? | Enables automatic classification into `STUDENT` or `FACULTY` audience upon verified email login. | **Observed Examples**:<br/>• Student: `*@vitstudent.ac.in`<br/>• Faculty: `*@vit.ac.in` | **Decision Confirmed**: Keep patterns configurable via environment variables (`STUDENT_EMAIL_REGEX`, `FACULTY_EMAIL_REGEX`). Keep automatic classification **disabled by default** (`ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION=false`) until universally confirmed. Fail safe to `PENDING` on any conflict. Never infer `ADMIN` privileges. | **No** (Controlled manual fallback allows Milestone 2 to proceed). | Developer / Campus Administration |
| **D-02** | **Alternative Identity Verification / Manual Fallback & Retention**:<br/>How will users be verified if institutional email patterns cannot be automatically classified, and how is ID evidence handled? | Protects user privacy while providing an onboarding path for unmatched or unconfirmed accounts. | **Option A**: Private storage with signed URLs & 30-day purge.<br/>**Option B**: Public storage (Insecure).<br/>**Option C**: In-person verification only. | **Decision Confirmed**: Users upload campus ID card to private Supabase Storage bucket (`id-documents`). Signed URLs with 15-minute TTL accessible only by admins. Evidence purged within 30 days of decision with exponential retry and failure monitoring. Audit log records decision permanently. | **Resolved for Milestone 2 design**. | Developer |
| **D-03** | **Institutional Branding & Approval**:<br/>Does the project have formal permission to use VIT trademarks and recruit on campus? | Using university names/logos without approval risks trademark warnings or campus disciplinary action. | **Option A**: Seek formal incubation/approval from VIT Chennai administration.<br/>**Option B**: Launch as an independent, unofficial student-run platform with clear disclaimers.<br/>**Option C**: Rebrand as a generic community carpooling platform with campus destination focus. | Display prominent disclaimer: *"Independent student project not officially affiliated with or endorsed by VIT Chennai."* Seek student council endorsement. | **No** (Blocks public pilot marketing only). | Developer |
| **D-04** | **Cost-Sharing Rules & Limits**:<br/>What formula or ceiling governs passenger cost-sharing to avoid illegal commercial ride-hailing? | Motor Vehicles Act and local transport regulations strictly prohibit unlicensed commercial taxi operations. True carpooling must be non-profit cost-sharing. | **Option A**: Strict maximum cost per km based on fuel costs (e.g., max ₹3-₹4/km divided by capacity).<br/>**Option B**: Fixed flat suggested brackets (e.g. ₹50, ₹100 for campus-to-city corridors).<br/>**Option C**: Free ride platform with zero financial exchange in MVP. | Provide a non-binding suggested contribution based on standard fuel rate per km, with an explicit hard cap. No in-app payment transactions in MVP. | **Blocks Milestone 3 pricing logic**. | Developer / Legal Review |
| **D-05** | **Pending Booking Expiration Window**:<br/>When should unaccepted booking requests automatically expire? | Prevents passengers from being stranded waiting for an inactive driver, or seats being locked right before departure. | **Option A**: 6 hours after request.<br/>**Option B**: Auto-expire 30 minutes before scheduled ride departure.<br/>**Option C**: Both (whichever comes first). | Whichever comes first: 12 hours from request OR 45 minutes prior to ride departure. | **Blocks Milestone 4**. | Developer |
| **D-06** | **Privacy & Data Retention Horizon**:<br/>How long should completed/cancelled rides and locations be retained? | Compliance with privacy standards and personal safety considerations. Storing long historical GPS trajectories creates privacy liabilities. | **Option A**: Retain indefinitely for user ride histories.<br/>**Option B**: Prune spatial route details 30 days after ride completion, keeping aggregate stats.<br/>**Option C**: Delete all booking logs after 90 days. | Retain booking records for 60 days for dispute safety, but truncate fine coordinates and route polylines 14 days after completion. | **Blocks Milestone 7**. | Developer |
| **D-07** | **Geocoding & Map Providers**:<br/>Which map tile and routing engine fits the zero-cost/low-cost budget? | Google Maps API can easily incur unexpected recurring charges. | **Option A**: MapLibre GL + OpenStreetMap vector tiles (Protomaps/OpenMapTiles) + OSRM/Valhalla.<br/>**Option B**: Mapbox free tier (50k loads/month).<br/>**Option C**: OpenRouteService free tier. | MapLibre GL with Carto/OSM raster or vector tiles, and self-hosted OSRM or OpenRouteService free tier for routing. PostGIS handles spatial pre-filtering. | **Blocks Milestone 3 UI/Routing**. | Developer |
| **D-08** | **Database & Local PostGIS Setup Strategy**:<br/>How will the PostgreSQL/PostGIS environment be provisioned for local development and testing? | Docker is now installed and running natively on Apple Silicon. | **Option A**: Docker Compose with custom arm64 PostGIS build.<br/>**Option B**: Native Homebrew.<br/>**Option C**: Remote cloud database. | **Resolved in Milestone 1**: Native Apple Silicon PostgreSQL 16 + PostGIS 3.6 Docker container running on port `5433` with 3 isolated databases (`dev`, `test`, `shadow`). | **RESOLVED**. | Developer |
| **D-09** | **Policy on Minors / Safety Guardrails**:<br/>Will 1st-year students under age 18 be permitted, and are emergency contacts required? | Safety and legal liability in case of roadside emergencies. | **Option A**: Require emergency contact name and phone number on all student profiles.<br/>**Option B**: Minimum age 18 verification.<br/>**Option C**: SOS/Share Live Trip button for all active rides. | Require emergency contact phone number on registration. Add a "Share Trip Status" link for active rides. | **Blocks Milestone 2 & 7**. | Developer |
| **D-10** | **Pilot Launch Readiness Criteria**:<br/>What metric defines readiness for public campus testing? | Releasing prematurely could harm trust if rides fail or security leaks occur. | **Option A**: 100% automated test suite passing + 10 manual simulated rides with real devices.<br/>**Option B**: Closed alpha with 10 faculty members and 10 students.<br/>**Option C**: Bug bounty / security review sign-off. | 100% security test pass rate + closed alpha test with 5 student drivers and 5 faculty drivers across 2 campus corridors. | **Blocks Milestone 7 rollout**. | Developer |
