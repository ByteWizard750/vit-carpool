-- 1. Extend user_role_type enum
ALTER TYPE "user_role_type" ADD VALUE IF NOT EXISTS 'MODERATOR';
ALTER TYPE "user_role_type" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

-- 2. Add admin MFA fields to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_mfa_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_mfa_secret" VARCHAR(128);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_mfa_verified_at" TIMESTAMPTZ(6);

-- 3. Create admin_invitations table
CREATE TABLE IF NOT EXISTS "admin_invitations" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "email" VARCHAR(255) NOT NULL,
  "role" "user_role_type" NOT NULL DEFAULT 'MODERATOR',
  "token_hash" VARCHAR(128) NOT NULL UNIQUE,
  "invited_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "admin_invitations_email_idx" ON "admin_invitations"("email");
CREATE INDEX IF NOT EXISTS "admin_invitations_token_hash_idx" ON "admin_invitations"("token_hash");

-- 4. Create moderation_notes table
CREATE TABLE IF NOT EXISTS "moderation_notes" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "target_user_id" UUID REFERENCES "users"("id") ON DELETE CASCADE,
  "target_ride_id" UUID REFERENCES "rides"("id") ON DELETE CASCADE,
  "target_report_id" UUID REFERENCES "reports"("id") ON DELETE CASCADE,
  "author_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "moderation_notes_target_user_id_idx" ON "moderation_notes"("target_user_id");
CREATE INDEX IF NOT EXISTS "moderation_notes_target_ride_id_idx" ON "moderation_notes"("target_ride_id");
CREATE INDEX IF NOT EXISTS "moderation_notes_target_report_id_idx" ON "moderation_notes"("target_report_id");

