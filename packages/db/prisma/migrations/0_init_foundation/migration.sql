-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateTable
CREATE TABLE IF NOT EXISTS "system_health_records" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "service" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "details" JSONB,
    "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_health_records_pkey" PRIMARY KEY ("id")
);
