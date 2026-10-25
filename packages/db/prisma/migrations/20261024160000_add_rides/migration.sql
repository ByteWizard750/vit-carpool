-- -----------------------------------------------------------------------------
-- Milestone 3.2: Ride Publishing & Management Migration
-- -----------------------------------------------------------------------------

-- 1. Add Unique Constraint on vehicles(id, user_id) for Composite Foreign Key Reference
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_id_user_id_key" UNIQUE ("id", "user_id");

-- 2. Create RideStatus Enum
CREATE TYPE "ride_status_type" AS ENUM ('SCHEDULED', 'CANCELLED');

-- 3. Create Rides Table
CREATE TABLE "rides" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "driver_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "audience" "audience_type" NOT NULL,
    "origin" VARCHAR(128) NOT NULL,
    "destination" VARCHAR(128) NOT NULL,
    "pickup_description" VARCHAR(255),
    "dropoff_description" VARCHAR(255),
    "departure_time" TIMESTAMPTZ(6) NOT NULL,
    "available_seats" INTEGER NOT NULL,
    "cost_per_seat" INTEGER,
    "status" "ride_status_type" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- 4. Foreign Key 1: Strict Database-Level Audience Isolation
-- The ride's (driver_id, audience) MUST match the driver's verified (id, audience) on users
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_audience_fkey" 
    FOREIGN KEY ("driver_id", "audience") REFERENCES "users"("id", "audience") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Foreign Key 2: Strict Database-Level Vehicle Ownership
-- The ride's (vehicle_id, driver_id) MUST match the driver's registered vehicle on vehicles(id, user_id)
ALTER TABLE "rides" ADD CONSTRAINT "rides_vehicle_id_driver_id_fkey" 
    FOREIGN KEY ("vehicle_id", "driver_id") REFERENCES "vehicles"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Check Constraints: Passenger Capacity and Cost Share
ALTER TABLE "rides" ADD CONSTRAINT "chk_rides_available_seats" 
    CHECK ("available_seats" >= 1 AND "available_seats" <= 6);

ALTER TABLE "rides" ADD CONSTRAINT "chk_rides_cost_per_seat" 
    CHECK ("cost_per_seat" IS NULL OR ("cost_per_seat" >= 0 AND "cost_per_seat" <= 1000));

-- 7. Indexes for Performance and Spatial Corridor Lookups
CREATE INDEX "rides_driver_id_idx" ON "rides"("driver_id");
CREATE INDEX "rides_vehicle_id_idx" ON "rides"("vehicle_id");
CREATE INDEX "rides_audience_status_departure_time_idx" ON "rides"("audience", "status", "departure_time");
CREATE INDEX "rides_departure_time_idx" ON "rides"("departure_time");

-- 8. Runtime Permissions for app_user
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON "rides" TO app_user;
    END IF;
END
$$;
