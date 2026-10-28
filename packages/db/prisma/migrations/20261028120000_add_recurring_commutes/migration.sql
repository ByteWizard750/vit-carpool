-- -----------------------------------------------------------------------------
-- Milestone 11: Recurring Commutes & Materialization Migration
-- -----------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "recurring_commute_status_type" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "rides" ADD COLUMN "recurring_commute_id" UUID,
ADD COLUMN "scheduled_occurrence" DATE;

-- CreateTable
CREATE TABLE "recurring_commutes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "driver_id" UUID NOT NULL,
    "audience" "audience_type" NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "origin" VARCHAR(128) NOT NULL,
    "origin_address" VARCHAR(255),
    "origin_latitude" DOUBLE PRECISION,
    "origin_longitude" DOUBLE PRECISION,
    "origin_place_id" VARCHAR(128),
    "destination" VARCHAR(128) NOT NULL,
    "destination_address" VARCHAR(255),
    "destination_latitude" DOUBLE PRECISION,
    "destination_longitude" DOUBLE PRECISION,
    "destination_place_id" VARCHAR(128),
    "pickup_description" VARCHAR(255),
    "dropoff_description" VARCHAR(255),
    "weekdays" INTEGER[] NOT NULL,
    "departure_time" VARCHAR(5) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "available_seats" INTEGER NOT NULL,
    "cost_per_seat" INTEGER,
    "status" "recurring_commute_status_type" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_commutes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_commutes_driver_id_idx" ON "recurring_commutes"("driver_id");
CREATE INDEX "recurring_commutes_vehicle_id_idx" ON "recurring_commutes"("vehicle_id");
CREATE INDEX "recurring_commutes_status_idx" ON "recurring_commutes"("status");

-- CreateIndex on rides
CREATE UNIQUE INDEX "rides_recurring_commute_id_scheduled_occurrence_key" ON "rides"("recurring_commute_id", "scheduled_occurrence");
CREATE INDEX "rides_recurring_commute_id_idx" ON "rides"("recurring_commute_id");

-- AddForeignKey
ALTER TABLE "recurring_commutes" ADD CONSTRAINT "recurring_commutes_driver_id_audience_fkey" FOREIGN KEY ("driver_id", "audience") REFERENCES "users"("id", "audience") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recurring_commutes" ADD CONSTRAINT "recurring_commutes_vehicle_id_driver_id_fkey" FOREIGN KEY ("vehicle_id", "driver_id") REFERENCES "vehicles"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rides" ADD CONSTRAINT "rides_recurring_commute_id_fkey" FOREIGN KEY ("recurring_commute_id") REFERENCES "recurring_commutes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
