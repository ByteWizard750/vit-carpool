-- CreateEnum
CREATE TYPE "audience_type" AS ENUM ('STUDENT', 'FACULTY');

-- CreateEnum
CREATE TYPE "verification_status_type" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "verification_method_type" AS ENUM ('AUTOMATIC_EMAIL', 'MANUAL_ID_REVIEW', 'ADMIN_OVERRIDE');

-- CreateEnum
CREATE TYPE "user_role_type" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "verification_request_status_type" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "auth_user_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "audience" "audience_type",
    "verification_status" "verification_status_type" NOT NULL DEFAULT 'PENDING',
    "verification_method" "verification_method_type",
    "verified_at" TIMESTAMPTZ(6),
    "auth_updated_at" TIMESTAMPTZ(6),
    "role" "user_role_type" NOT NULL DEFAULT 'USER',
    "full_name" VARCHAR(255) NOT NULL,
    "phone_number" VARCHAR(32),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "requested_audience" "audience_type" NOT NULL,
    "institutional_email" VARCHAR(255) NOT NULL,
    "id_card_document_path" VARCHAR(1024),
    "id_card_document_purged_at" TIMESTAMPTZ(6),
    "status" "verification_request_status_type" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "actor_id" UUID,
    "actor_role" "user_role_type",
    "action" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(100) NOT NULL,
    "target_id" UUID NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_user_id_key" ON "users"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_audience_key" ON "users"("id", "audience");

-- CreateIndex
CREATE INDEX "verification_requests_status_idx" ON "verification_requests"("status");

-- CreateIndex
CREATE INDEX "verification_requests_user_id_idx" ON "verification_requests"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Hand-Written Database Constraints, Triggers & Role Permissions
-- -----------------------------------------------------------------------------

-- 1. Email Lowercase Storage Constraint (users)
ALTER TABLE "users" ADD CONSTRAINT "chk_users_email_lowercase" 
    CHECK ("email" = LOWER("email"));

-- 2. Permitted Verification State Combinations Check Constraint (users)
ALTER TABLE "users" ADD CONSTRAINT "chk_users_verification_state" CHECK (
    -- State 1: Active VERIFIED user (must have audience, method, and verified_at)
    ("verification_status" = 'VERIFIED' 
        AND "audience" IS NOT NULL 
        AND "verification_method" IS NOT NULL 
        AND "verified_at" IS NOT NULL)
    OR
    -- State 2: SUSPENDED user (retains verified audience and method from prior verification; locked out of carpooling)
    ("verification_status" = 'SUSPENDED' 
        AND "audience" IS NOT NULL 
        AND "verification_method" IS NOT NULL 
        AND "verified_at" IS NOT NULL)
    OR
    -- State 3: REJECTED user (ineligible; audience and verified_at must be NULL)
    ("verification_status" = 'REJECTED' 
        AND "audience" IS NULL 
        AND "verified_at" IS NULL)
    OR
    -- State 4: PENDING (Initial Registration: no audience, unclassified, awaiting verification)
    ("verification_status" = 'PENDING' 
        AND "audience" IS NULL 
        AND "verification_method" IS NULL 
        AND "verified_at" IS NULL)
    OR
    -- State 5: PENDING (Re-verification after email change: retains prior verified audience & method, but locked out until re-verified)
    ("verification_status" = 'PENDING' 
        AND "audience" IS NOT NULL 
        AND "verification_method" IS NOT NULL)
);

-- 3. Email Lowercase Storage Constraint (verification_requests)
ALTER TABLE "verification_requests" ADD CONSTRAINT "chk_verification_requests_email_lowercase" 
    CHECK ("institutional_email" = LOWER("institutional_email"));

-- 4. Partial Unique Index: Only one active pending verification request allowed per user at a time
CREATE UNIQUE INDEX "uq_user_pending_verification" 
    ON "verification_requests"("user_id") 
    WHERE "status" = 'PENDING';

-- 5. Immutability Trigger on audit_logs
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log records are append-only. UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_audit_log_immutable"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- 6. Role Permissions (app_user least privilege)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT USAGE ON SCHEMA public TO app_user;
        GRANT SELECT, INSERT, UPDATE ON "users" TO app_user;
        GRANT SELECT, INSERT, UPDATE ON "verification_requests" TO app_user;
        GRANT SELECT, INSERT ON "audit_logs" TO app_user;
        GRANT SELECT ON "system_health_records" TO app_user;
        REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM app_user;
        REVOKE CREATE ON SCHEMA public FROM app_user;
    END IF;
END
$$;
