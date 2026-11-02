-- -----------------------------------------------------------------------------
-- Milestone 7.1: Real-Time Ride Tracking, Boarding, and Proximity Migration
-- -----------------------------------------------------------------------------

-- 1. Alter enum ride_status_type to add IN_PROGRESS
ALTER TYPE "ride_status_type" ADD VALUE IF NOT EXISTS 'IN_PROGRESS' BEFORE 'CANCELLED';

-- 2. Alter enum notification_type to add tracking notification types
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'RIDE_STARTED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'DRIVER_APPROACHING';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'RIDE_COMPLETED';

-- 3. Create boarding_status_type enum
DO $$ BEGIN
  CREATE TYPE "boarding_status_type" AS ENUM ('WAITING', 'BOARDING', 'BOARDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. Alter bookings table to add pickup and boarding columns
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "pickup_address" VARCHAR(255);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "pickup_latitude" DOUBLE PRECISION;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "pickup_longitude" DOUBLE PRECISION;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "pickup_description" VARCHAR(255);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "boarding_status" "boarding_status_type" NOT NULL DEFAULT 'WAITING';
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "boarded_at" TIMESTAMPTZ(6);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "proximity_notified_at" TIMESTAMPTZ(6);

-- 5. Create ride_tracking_sessions table
CREATE TABLE IF NOT EXISTS "ride_tracking_sessions" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "ride_id" UUID NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMPTZ(6),
  "is_stale" BOOLEAN NOT NULL DEFAULT false,
  "last_update_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ride_tracking_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ride_tracking_sessions_ride_id_key" UNIQUE ("ride_id"),
  CONSTRAINT "ride_tracking_sessions_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 6. Create driver_location_snapshots table
CREATE TABLE IF NOT EXISTS "driver_location_snapshots" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "ride_id" UUID NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "accuracy" DOUBLE PRECISION,
  "speed_kmh" DOUBLE PRECISION,
  "heading" DOUBLE PRECISION,
  "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "driver_location_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "driver_location_snapshots_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 7. Indexes for performance
CREATE INDEX IF NOT EXISTS "driver_location_snapshots_ride_id_recorded_at_idx" ON "driver_location_snapshots"("ride_id", "recorded_at" DESC);
CREATE INDEX IF NOT EXISTS "ride_tracking_sessions_ride_id_idx" ON "ride_tracking_sessions"("ride_id");
CREATE INDEX IF NOT EXISTS "bookings_ride_id_boarding_status_idx" ON "bookings"("ride_id", "boarding_status");

-- 8. Permissions for app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ride_tracking_sessions" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "driver_location_snapshots" TO app_user;

