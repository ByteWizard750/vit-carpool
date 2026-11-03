-- -----------------------------------------------------------------------------
-- Milestone 8: Secure Passenger Boarding & OTP Verification
-- -----------------------------------------------------------------------------

-- 1. Add boarding OTP columns to bookings table
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "boarding_otp_hash" VARCHAR(128);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "boarding_otp_salt" VARCHAR(64);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "boarding_otp_encrypted" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "boarding_otp_expires_at" TIMESTAMPTZ(6);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "boarding_otp_failed_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "boarding_otp_lockout_until" TIMESTAMPTZ(6);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "boarding_otp_regen_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "boarding_otp_last_regen_at" TIMESTAMPTZ(6);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "boarding_otp_consumed_at" TIMESTAMPTZ(6);

