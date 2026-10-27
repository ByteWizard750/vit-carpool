-- -----------------------------------------------------------------------------
-- Authentication & OTP Verification Persistent State Migration
-- -----------------------------------------------------------------------------

-- CreateTable
CREATE TABLE IF NOT EXISTS "otp_verifications" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "email" VARCHAR(255) NOT NULL,
    "verifier_hash" VARCHAR(128) NOT NULL,
    "salt" VARCHAR(64) NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "cooldown_until" TIMESTAMPTZ(6) NOT NULL,
    "intent" VARCHAR(32) NOT NULL DEFAULT 'signup',
    "full_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "otp_verifications_email_key" ON "otp_verifications"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "otp_verifications_email_idx" ON "otp_verifications"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "otp_verifications_expires_at_idx" ON "otp_verifications"("expires_at");
