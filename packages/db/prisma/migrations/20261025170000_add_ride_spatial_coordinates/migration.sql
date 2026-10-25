-- -----------------------------------------------------------------------------
-- Milestone 5.1: Location Autocomplete and Geographic Proximity Migration
-- -----------------------------------------------------------------------------

-- 1. Add spatial and location fields to rides table
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "origin_address" VARCHAR(255);
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "origin_latitude" DOUBLE PRECISION;
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "origin_longitude" DOUBLE PRECISION;
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "origin_place_id" VARCHAR(128);

ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "destination_address" VARCHAR(255);
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "destination_latitude" DOUBLE PRECISION;
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "destination_longitude" DOUBLE PRECISION;
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "destination_place_id" VARCHAR(128);

-- 2. Add PostGIS geography columns for high-performance spatial indexing
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "origin_geom" geography(Point, 4326);
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "destination_geom" geography(Point, 4326);

-- 3. Constraints for coordinate validity and paired lat/lon values
ALTER TABLE "rides" ADD CONSTRAINT "chk_rides_origin_lat"
  CHECK ("origin_latitude" IS NULL OR ("origin_latitude" >= -90.0 AND "origin_latitude" <= 90.0));
ALTER TABLE "rides" ADD CONSTRAINT "chk_rides_origin_lon"
  CHECK ("origin_longitude" IS NULL OR ("origin_longitude" >= -180.0 AND "origin_longitude" <= 180.0));
ALTER TABLE "rides" ADD CONSTRAINT "chk_rides_origin_coords_paired"
  CHECK (("origin_latitude" IS NULL AND "origin_longitude" IS NULL) OR ("origin_latitude" IS NOT NULL AND "origin_longitude" IS NOT NULL));

ALTER TABLE "rides" ADD CONSTRAINT "chk_rides_dest_lat"
  CHECK ("destination_latitude" IS NULL OR ("destination_latitude" >= -90.0 AND "destination_latitude" <= 90.0));
ALTER TABLE "rides" ADD CONSTRAINT "chk_rides_dest_lon"
  CHECK ("destination_longitude" IS NULL OR ("destination_longitude" >= -180.0 AND "destination_longitude" <= 180.0));
ALTER TABLE "rides" ADD CONSTRAINT "chk_rides_dest_coords_paired"
  CHECK (("destination_latitude" IS NULL AND "destination_longitude" IS NULL) OR ("destination_latitude" IS NOT NULL AND "destination_longitude" IS NOT NULL));

-- 4. Trigger function to synchronize geography columns with coordinate fields
CREATE OR REPLACE FUNCTION sync_ride_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.origin_longitude IS NOT NULL AND NEW.origin_latitude IS NOT NULL THEN
    NEW.origin_geom := ST_SetSRID(ST_MakePoint(NEW.origin_longitude, NEW.origin_latitude), 4326)::geography;
  ELSE
    NEW.origin_geom := NULL;
  END IF;

  IF NEW.destination_longitude IS NOT NULL AND NEW.destination_latitude IS NOT NULL THEN
    NEW.destination_geom := ST_SetSRID(ST_MakePoint(NEW.destination_longitude, NEW.destination_latitude), 4326)::geography;
  ELSE
    NEW.destination_geom := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_ride_geom ON rides;
CREATE TRIGGER trg_sync_ride_geom
BEFORE INSERT OR UPDATE OF origin_latitude, origin_longitude, destination_latitude, destination_longitude
ON rides
FOR EACH ROW
EXECUTE FUNCTION sync_ride_geom();

-- 5. Create GiST spatial indexes
CREATE INDEX IF NOT EXISTS "rides_origin_geom_idx" ON "rides" USING GIST ("origin_geom");
CREATE INDEX IF NOT EXISTS "rides_destination_geom_idx" ON "rides" USING GIST ("destination_geom");

-- 6. Backfill existing sample rides with recognized coordinates
UPDATE "rides"
SET "origin_latitude" = 12.9249,
    "origin_longitude" = 80.1171,
    "origin_address" = 'Tambaram Railway Station, GST Road, Chennai, Tamil Nadu 600045'
WHERE "origin_latitude" IS NULL AND ("origin" ILIKE '%Tambaram%');

UPDATE "rides"
SET "origin_latitude" = 12.8912,
    "origin_longitude" = 80.0817,
    "origin_address" = 'Vandalur, Chennai Outer Ring Road, Chennai, Tamil Nadu 600048'
WHERE "origin_latitude" IS NULL AND ("origin" ILIKE '%Vandalur%');

UPDATE "rides"
SET "destination_latitude" = 12.8406,
    "destination_longitude" = 80.1534,
    "destination_address" = 'VIT Chennai Campus, Vandalur-Kelambakkam Road, Chennai, Tamil Nadu 600127'
WHERE "destination_latitude" IS NULL AND ("destination" ILIKE '%VIT%' OR "destination" ILIKE '%Campus%');

-- Re-trigger geometry generation for updated rows
UPDATE "rides"
SET "origin_latitude" = "origin_latitude",
    "destination_latitude" = "destination_latitude"
WHERE "origin_latitude" IS NOT NULL OR "destination_latitude" IS NOT NULL;

-- 7. Ensure permissions for app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "rides" TO app_user;
