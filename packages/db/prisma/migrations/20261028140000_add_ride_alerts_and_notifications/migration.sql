-- -----------------------------------------------------------------------------
-- Milestone 12: Ride Alerts & In-App Notifications Migration
-- -----------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "ride_alert_status_type" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('RIDE_MATCH', 'BOOKING_REQUESTED', 'BOOKING_APPROVED', 'BOOKING_REJECTED', 'BOOKING_CANCELLED', 'RIDE_CANCELLED');

-- CreateTable
CREATE TABLE "ride_alerts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "audience" "audience_type" NOT NULL,
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
    "radius_km" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "earliest_departure_time" VARCHAR(5),
    "latest_departure_time" VARCHAR(5),
    "min_seats" INTEGER NOT NULL DEFAULT 1,
    "status" "ride_alert_status_type" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "recipient_id" UUID NOT NULL,
    "audience" "audience_type" NOT NULL,
    "type" "notification_type" NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "message" VARCHAR(255) NOT NULL,
    "ride_id" UUID,
    "booking_id" UUID,
    "recurring_commute_id" UUID,
    "ride_alert_id" UUID,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "dedup_key" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ride_alerts_user_id_idx" ON "ride_alerts"("user_id");
CREATE INDEX "ride_alerts_audience_status_idx" ON "ride_alerts"("audience", "status");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_is_read_idx" ON "notifications"("recipient_id", "is_read");
CREATE INDEX "notifications_recipient_id_created_at_idx" ON "notifications"("recipient_id", "created_at" DESC);
CREATE UNIQUE INDEX "notifications_recipient_id_dedup_key_key" ON "notifications"("recipient_id", "dedup_key");

-- AddForeignKey
ALTER TABLE "ride_alerts" ADD CONSTRAINT "ride_alerts_user_id_audience_fkey" FOREIGN KEY ("user_id", "audience") REFERENCES "users"("id", "audience") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_audience_fkey" FOREIGN KEY ("recipient_id", "audience") REFERENCES "users"("id", "audience") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recurring_commute_id_fkey" FOREIGN KEY ("recurring_commute_id") REFERENCES "recurring_commutes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ride_alert_id_fkey" FOREIGN KEY ("ride_alert_id") REFERENCES "ride_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
