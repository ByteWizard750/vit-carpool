-- -----------------------------------------------------------------------------
-- Milestone 13: Trust, Safety, User Blocking & Incident Reporting Migration
-- -----------------------------------------------------------------------------

-- AlterTable users
ALTER TABLE "users" ADD COLUMN "is_suspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "suspension_reason" VARCHAR(500);
ALTER TABLE "users" ADD COLUMN "suspended_at" TIMESTAMPTZ(6);
ALTER TABLE "users" ADD COLUMN "suspended_by" UUID;

-- CreateEnum
CREATE TYPE "report_category_type" AS ENUM (
    'SAFETY_CONCERN',
    'HARASSMENT',
    'NO_SHOW',
    'FRAUD',
    'FARE_DISPUTE',
    'SPAM',
    'INAPPROPRIATE_BEHAVIOR',
    'OTHER'
);

-- CreateEnum
CREATE TYPE "report_status_type" AS ENUM (
    'PENDING',
    'INVESTIGATING',
    'RESOLVED',
    'DISMISSED'
);

-- CreateTable blocks
CREATE TABLE "blocks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable reports
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "reporter_id" UUID NOT NULL,
    "reported_user_id" UUID,
    "ride_id" UUID,
    "booking_id" UUID,
    "message_id" UUID,
    "category" "report_category_type" NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "status" "report_status_type" NOT NULL DEFAULT 'PENDING',
    "resolution_notes" VARCHAR(1000),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex blocks
CREATE UNIQUE INDEX "blocks_blocker_id_blocked_id_key" ON "blocks"("blocker_id", "blocked_id");
CREATE INDEX "blocks_blocker_id_idx" ON "blocks"("blocker_id");
CREATE INDEX "blocks_blocked_id_idx" ON "blocks"("blocked_id");

-- CreateIndex reports
CREATE INDEX "reports_reporter_id_idx" ON "reports"("reporter_id");
CREATE INDEX "reports_reported_user_id_idx" ON "reports"("reported_user_id");
CREATE INDEX "reports_status_idx" ON "reports"("status");
CREATE INDEX "reports_category_idx" ON "reports"("category");
CREATE INDEX "reports_created_at_idx" ON "reports"("created_at" DESC);

-- ForeignKeys
ALTER TABLE "users" ADD CONSTRAINT "users_suspended_by_fkey" FOREIGN KEY ("suspended_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
