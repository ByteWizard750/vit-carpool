-- -----------------------------------------------------------------------------
-- Quick Ride Publication Idempotency Migration
-- -----------------------------------------------------------------------------

-- CreateTable
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "target_type" VARCHAR(64) NOT NULL DEFAULT 'RIDE',
    "request_hash" VARCHAR(64) NOT NULL,
    "ride_id" UUID,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_keys_user_id_key_key" ON "idempotency_keys"("user_id", "key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idempotency_keys_user_id_idx" ON "idempotency_keys"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_ride_id_fkey"
    FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;
