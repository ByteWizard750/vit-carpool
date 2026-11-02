-- -----------------------------------------------------------------------------
-- Milestone 7.6: Proximity Notifications, Boarding Workflow & Missed Status
-- -----------------------------------------------------------------------------

-- 1. Alter BoardingStatus enum to add MISSED
ALTER TYPE "boarding_status_type" ADD VALUE IF NOT EXISTS 'MISSED';

-- 2. Alter NotificationType enum to add DRIVER_ARRIVED and MISSED_PICKUP
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'DRIVER_ARRIVED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'MISSED_PICKUP';

-- 3. Add timestamp tracking columns to bookings table
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "arrived_notified_at" TIMESTAMPTZ(6);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "missed_notified_at" TIMESTAMPTZ(6);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "missed_at" TIMESTAMPTZ(6);

-- 4. Create web_push_subscriptions table
CREATE TABLE IF NOT EXISTS "web_push_subscriptions" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "web_push_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "web_push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint"),
  CONSTRAINT "web_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "web_push_subscriptions_user_id_idx" ON "web_push_subscriptions"("user_id");

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "web_push_subscriptions" TO app_user;

