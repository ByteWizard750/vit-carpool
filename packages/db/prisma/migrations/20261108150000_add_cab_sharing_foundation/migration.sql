-- 1. Create ride_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ride_type') THEN
    CREATE TYPE "ride_type" AS ENUM ('VEHICLE_RIDE', 'CAB_SHARE');
  END IF;
END $$;

-- 2. Add notification types for cab sharing
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'CAB_FARE_UPDATED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'CAB_BOOKING_DEADLINE';

-- 3. Modify rides table for cab sharing support
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "ride_type" "ride_type" NOT NULL DEFAULT 'VEHICLE_RIDE';
ALTER TABLE "rides" ALTER COLUMN "vehicle_id" DROP NOT NULL;

-- 4. Adjust capacity constraints to support cab capacity up to 8
ALTER TABLE "rides" DROP CONSTRAINT IF EXISTS "chk_rides_total_seats";
ALTER TABLE "rides" ADD CONSTRAINT "chk_rides_total_seats" CHECK (total_seats >= 1 AND total_seats <= 8);

ALTER TABLE "rides" DROP CONSTRAINT IF EXISTS "chk_rides_available_seats";
ALTER TABLE "rides" ADD CONSTRAINT "chk_rides_available_seats" CHECK (available_seats >= 0 AND available_seats <= 8);

-- 5. Add discriminator consistency constraint: Vehicle ride requires vehicle; Cab share must not have personal vehicle
ALTER TABLE "rides" DROP CONSTRAINT IF EXISTS "chk_rides_ride_type_vehicle";
ALTER TABLE "rides" ADD CONSTRAINT "chk_rides_ride_type_vehicle" CHECK (
  (ride_type = 'VEHICLE_RIDE' AND vehicle_id IS NOT NULL) OR
  (ride_type = 'CAB_SHARE' AND vehicle_id IS NULL)
);

CREATE INDEX IF NOT EXISTS "rides_ride_type_idx" ON "rides"("ride_type");

-- 6. Create cab_share_details table
CREATE TABLE IF NOT EXISTS "cab_share_details" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "ride_id" UUID NOT NULL UNIQUE REFERENCES "rides"("id") ON DELETE CASCADE,
  "total_capacity" INTEGER NOT NULL,
  "estimated_total_fare" INTEGER NOT NULL,
  "final_total_fare" INTEGER,
  "fare_revision" INTEGER NOT NULL DEFAULT 1,
  "booking_deadline" TIMESTAMPTZ(6) NOT NULL,
  "cab_service" VARCHAR(64),
  "cab_booking_ref" VARCHAR(32),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "chk_cab_share_total_capacity" CHECK ("total_capacity" >= 2 AND "total_capacity" <= 8),
  CONSTRAINT "chk_cab_share_estimated_fare" CHECK ("estimated_total_fare" >= 50 AND "estimated_total_fare" <= 20000),
  CONSTRAINT "chk_cab_share_final_fare" CHECK ("final_total_fare" IS NULL OR ("final_total_fare" >= 50 AND "final_total_fare" <= 30000)),
  CONSTRAINT "chk_cab_share_fare_revision" CHECK ("fare_revision" >= 1)
);

CREATE INDEX IF NOT EXISTS "cab_share_details_ride_id_idx" ON "cab_share_details"("ride_id");
CREATE INDEX IF NOT EXISTS "cab_share_details_booking_deadline_idx" ON "cab_share_details"("booking_deadline");

-- 7. Create cab_fare_acknowledgements table
CREATE TABLE IF NOT EXISTS "cab_fare_acknowledgements" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "cab_detail_id" UUID NOT NULL REFERENCES "cab_share_details"("id") ON DELETE CASCADE,
  "booking_id" UUID NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "fare_revision" INTEGER NOT NULL,
  "acknowledged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cab_fare_ack_booking_revision_unique" UNIQUE ("booking_id", "fare_revision")
);

CREATE INDEX IF NOT EXISTS "cab_fare_ack_cab_detail_id_idx" ON "cab_fare_acknowledgements"("cab_detail_id");
CREATE INDEX IF NOT EXISTS "cab_fare_ack_booking_id_idx" ON "cab_fare_acknowledgements"("booking_id");
CREATE INDEX IF NOT EXISTS "cab_fare_ack_user_id_idx" ON "cab_fare_acknowledgements"("user_id");

