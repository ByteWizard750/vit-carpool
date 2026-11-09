-- Safe Additive Migration: Fix unique constraint on cab_fare_acknowledgements
-- Changes unique constraint from (booking_id, fare_revision) to (booking_id, user_id, fare_revision).
-- This preserves all existing acknowledgement data while ensuring:
-- 1. Multiple passengers across different bookings/users can independently acknowledge the same fare revision.
-- 2. Duplicate acknowledgements by the same passenger for the same revision are strictly prevented.

ALTER TABLE "cab_fare_acknowledgements" DROP CONSTRAINT IF EXISTS "cab_fare_ack_booking_revision_unique";

ALTER TABLE "cab_fare_acknowledgements" ADD CONSTRAINT "cab_fare_ack_booking_user_revision_unique" UNIQUE ("booking_id", "user_id", "fare_revision");

