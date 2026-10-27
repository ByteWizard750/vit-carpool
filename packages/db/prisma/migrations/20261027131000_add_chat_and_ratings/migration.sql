-- -----------------------------------------------------------------------------
-- Milestone 7: Private Ride Chat and Driver Ratings Migration
-- -----------------------------------------------------------------------------

-- 1. Add COMPLETED value to ride_status_type enum if not exists
ALTER TYPE "ride_status_type" ADD VALUE IF NOT EXISTS 'COMPLETED';

-- 2. Create conversations table
CREATE TABLE IF NOT EXISTS "conversations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "booking_id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "passenger_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- 3. Unique and lookup indexes for conversations
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_booking_id_key" ON "conversations"("booking_id");
CREATE INDEX IF NOT EXISTS "conversations_passenger_id_idx" ON "conversations"("passenger_id");
CREATE INDEX IF NOT EXISTS "conversations_driver_id_idx" ON "conversations"("driver_id");
CREATE INDEX IF NOT EXISTS "conversations_ride_id_idx" ON "conversations"("ride_id");

-- 4. Foreign key constraints for conversations
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_ride_id_fkey"
    FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_passenger_id_fkey"
    FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_driver_id_fkey"
    FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Create messages table
CREATE TABLE IF NOT EXISTS "messages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "content" VARCHAR(1000) NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- 6. Indexes and foreign keys for messages
CREATE INDEX IF NOT EXISTS "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");
CREATE INDEX IF NOT EXISTS "messages_sender_id_idx" ON "messages"("sender_id");

ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey"
    FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Create driver_ratings table
CREATE TABLE IF NOT EXISTS "driver_ratings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "booking_id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "passenger_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "review" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_ratings_pkey" PRIMARY KEY ("id")
);

-- 8. Unique and lookup indexes for driver_ratings
CREATE UNIQUE INDEX IF NOT EXISTS "driver_ratings_booking_id_key" ON "driver_ratings"("booking_id");
CREATE INDEX IF NOT EXISTS "driver_ratings_driver_id_idx" ON "driver_ratings"("driver_id");
CREATE INDEX IF NOT EXISTS "driver_ratings_passenger_id_idx" ON "driver_ratings"("passenger_id");
CREATE INDEX IF NOT EXISTS "driver_ratings_ride_id_idx" ON "driver_ratings"("ride_id");

-- 9. Check constraint: rating between 1 and 5
ALTER TABLE "driver_ratings" ADD CONSTRAINT "chk_driver_ratings_range"
    CHECK ("rating" >= 1 AND "rating" <= 5);

-- 10. Foreign key constraints for driver_ratings
ALTER TABLE "driver_ratings" ADD CONSTRAINT "driver_ratings_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "driver_ratings" ADD CONSTRAINT "driver_ratings_ride_id_fkey"
    FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "driver_ratings" ADD CONSTRAINT "driver_ratings_passenger_id_fkey"
    FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "driver_ratings" ADD CONSTRAINT "driver_ratings_driver_id_fkey"
    FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 11. Grant runtime permissions to non-owner app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "conversations" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "messages" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "driver_ratings" TO app_user;
