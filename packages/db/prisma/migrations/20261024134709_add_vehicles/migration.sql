-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "make" VARCHAR(64) NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "color" VARCHAR(32) NOT NULL,
    "registration_number" VARCHAR(32) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicles_user_id_idx" ON "vehicles"("user_id");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Hand-Written Database Constraints, Indexes & Role Permissions
-- -----------------------------------------------------------------------------

-- 1. Capacity Range Check Constraint (cars only: 1 to 7 passenger seats)
ALTER TABLE "vehicles" ADD CONSTRAINT "chk_vehicles_capacity" 
    CHECK ("capacity" >= 1 AND "capacity" <= 7);

-- 2. Uppercase Registration Number Constraint
ALTER TABLE "vehicles" ADD CONSTRAINT "chk_vehicles_registration_format" 
    CHECK ("registration_number" = UPPER("registration_number"));

-- 3. Partial Unique Index: Only one active (non-deleted) vehicle per registration number
CREATE UNIQUE INDEX "uq_vehicles_active_registration" 
    ON "vehicles"("registration_number") 
    WHERE "deleted_at" IS NULL;

-- 4. Runtime Role Permissions (app_user least privilege)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON "vehicles" TO app_user;
    END IF;
END
$$;
