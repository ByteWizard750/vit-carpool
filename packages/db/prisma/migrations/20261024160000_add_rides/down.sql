-- -----------------------------------------------------------------------------
-- Rollback Milestone 3.2 Migration: Drop Rides and Associated Constraints
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        REVOKE ALL ON "rides" FROM app_user;
    END IF;
END
$$;

DROP TABLE IF EXISTS "rides" CASCADE;
DROP TYPE IF EXISTS "ride_status_type";
ALTER TABLE "vehicles" DROP CONSTRAINT IF EXISTS "vehicles_id_user_id_key";
