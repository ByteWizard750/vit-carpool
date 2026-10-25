-- -----------------------------------------------------------------------------
-- Milestone 4.2: Booking Requests and Seat Allocation Migration
-- -----------------------------------------------------------------------------

-- 1. Add total_seats to rides (backfilled with available_seats) and update capacity constraints
ALTER TABLE "rides" ADD COLUMN "total_seats" INTEGER;
UPDATE "rides" SET "total_seats" = "available_seats" WHERE "total_seats" IS NULL;
ALTER TABLE "rides" ALTER COLUMN "total_seats" SET DEFAULT 6;
ALTER TABLE "rides" ALTER COLUMN "total_seats" SET NOT NULL;
ALTER TABLE "rides" ADD CONSTRAINT "chk_rides_total_seats" 
    CHECK ("total_seats" >= 1 AND "total_seats" <= 6);

-- Update available_seats check constraint to allow 0 seats (fully booked)
ALTER TABLE "rides" DROP CONSTRAINT IF EXISTS "chk_rides_available_seats";
ALTER TABLE "rides" ADD CONSTRAINT "chk_rides_available_seats" 
    CHECK ("available_seats" >= 0 AND "available_seats" <= 6);

-- Invariant: available_seats can never exceed total_seats
ALTER TABLE "rides" ADD CONSTRAINT "chk_rides_available_le_total" 
    CHECK ("available_seats" <= "total_seats");

-- 2. Add Composite Unique Keys to rides for Booking FK reference
ALTER TABLE "rides" ADD CONSTRAINT "rides_id_audience_key" UNIQUE ("id", "audience");
ALTER TABLE "rides" ADD CONSTRAINT "rides_id_driver_id_key" UNIQUE ("id", "driver_id");

-- 3. Create BookingStatus Enum
CREATE TYPE "booking_status_type" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- 4. Create Bookings Table
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "ride_id" UUID NOT NULL,
    "passenger_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "audience" "audience_type" NOT NULL,
    "requested_seats" INTEGER NOT NULL,
    "status" "booking_status_type" NOT NULL DEFAULT 'PENDING',
    "confirmed_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- 5. Foreign Key Constraints: Strict Cohort Isolation & Driver Ownership
-- Booking's (ride_id, audience) MUST match rides(id, audience)
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_ride_id_audience_fkey"
    FOREIGN KEY ("ride_id", "audience") REFERENCES "rides"("id", "audience") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Booking's (passenger_id, audience) MUST match users(id, audience)
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_passenger_id_audience_fkey"
    FOREIGN KEY ("passenger_id", "audience") REFERENCES "users"("id", "audience") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Booking's (ride_id, driver_id) MUST match rides(id, driver_id)
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_ride_id_driver_id_fkey"
    FOREIGN KEY ("ride_id", "driver_id") REFERENCES "rides"("id", "driver_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Standard relational foreign keys for Prisma navigation
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_passenger_id_fkey"
    FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_id_fkey"
    FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_ride_id_fkey"
    FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Check Constraints: No Self-Booking & Valid Requested Seats
ALTER TABLE "bookings" ADD CONSTRAINT "chk_bookings_no_self_booking"
    CHECK ("passenger_id" <> "driver_id");

ALTER TABLE "bookings" ADD CONSTRAINT "chk_bookings_requested_seats"
    CHECK ("requested_seats" >= 1 AND "requested_seats" <= 6);

-- 7. Partial Unique Index: Prevent duplicate active bookings (PENDING or CONFIRMED) per passenger per ride
CREATE UNIQUE INDEX "idx_bookings_active_unique" 
    ON "bookings" ("ride_id", "passenger_id") 
    WHERE "status" IN ('PENDING', 'CONFIRMED');

-- 8. Indexes for Lookups and Status Filtering
CREATE INDEX "bookings_ride_id_idx" ON "bookings"("ride_id");
CREATE INDEX "bookings_passenger_id_idx" ON "bookings"("passenger_id");
CREATE INDEX "bookings_driver_id_idx" ON "bookings"("driver_id");
CREATE INDEX "bookings_status_idx" ON "bookings"("status");
CREATE INDEX "bookings_audience_status_idx" ON "bookings"("audience", "status");

-- 9. Runtime Permissions for app_user
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON "bookings" TO app_user;
    END IF;
END
$$;
