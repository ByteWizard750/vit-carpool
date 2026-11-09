-- -----------------------------------------------------------------------------
-- Milestone 8.1: Route Geometry Foundation Migration
-- Adds PostGIS LineString route column, route status enum, distance, duration,
-- route versioning and detour preference constraints.
-- -----------------------------------------------------------------------------

-- 1. Create RouteStatus Enum if not exists
DO $$ BEGIN
  CREATE TYPE "route_status_type" AS ENUM ('NONE', 'PENDING', 'READY', 'FALLBACK', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add route geometry and metadata columns to rides table
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "route_geom" geography(LineString, 4326);
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "route_distance_m" INTEGER;
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "route_duration_s" INTEGER;
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "route_status" "route_status_type" NOT NULL DEFAULT 'NONE';
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "route_provider" VARCHAR(32);
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "route_computed_at" TIMESTAMPTZ(6);
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "route_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "max_detour_minutes" INTEGER;

-- 3. Constraint on maximum acceptable driver detour (between 0 and 60 minutes)
ALTER TABLE "rides" DROP CONSTRAINT IF EXISTS "chk_rides_max_detour";
ALTER TABLE "rides" ADD CONSTRAINT "chk_rides_max_detour"
  CHECK ("max_detour_minutes" IS NULL OR ("max_detour_minutes" >= 0 AND "max_detour_minutes" <= 60));

-- 4. Create GiST spatial index on route geometry for corridor matching queries
CREATE INDEX IF NOT EXISTS "rides_route_geom_idx" ON "rides" USING GIST ("route_geom");

-- 5. Create B-tree index on route status for background worker queue polling
CREATE INDEX IF NOT EXISTS "rides_route_status_idx" ON "rides" ("route_status");

-- 6. Backfill existing scheduled rides with coordinates to PENDING for route generation
UPDATE "rides"
SET "route_status" = 'PENDING'
WHERE "status" = 'SCHEDULED'
  AND "origin_latitude" IS NOT NULL
  AND "origin_longitude" IS NOT NULL
  AND "destination_latitude" IS NOT NULL
  AND "destination_longitude" IS NOT NULL
  AND "route_geom" IS NULL;

