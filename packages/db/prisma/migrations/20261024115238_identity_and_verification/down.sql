-- Rollback Runbook for 20261024115238_identity_and_verification
-- NOTE: For emergency manual administrative rollback only. In production, adhere to Forward-Fix Principle (ADR-010).

DROP TRIGGER IF EXISTS "trg_audit_log_immutable" ON "audit_logs";
DROP FUNCTION IF EXISTS prevent_audit_log_mutation();
DROP INDEX IF EXISTS "uq_user_pending_verification";
ALTER TABLE "verification_requests" DROP CONSTRAINT IF EXISTS "chk_verification_requests_email_lowercase";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "chk_users_verification_state";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "chk_users_email_lowercase";
DROP TABLE IF EXISTS "audit_logs";
DROP TABLE IF EXISTS "verification_requests";
DROP TABLE IF EXISTS "users";
DROP TYPE IF EXISTS "verification_request_status_type";
DROP TYPE IF EXISTS "user_role_type";
DROP TYPE IF EXISTS "verification_method_type";
DROP TYPE IF EXISTS "verification_status_type";
DROP TYPE IF EXISTS "audience_type";
