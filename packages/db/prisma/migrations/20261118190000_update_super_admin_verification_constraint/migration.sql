BEGIN;

-- Update chk_users_verification_state to authorize SUPER_ADMIN without student/faculty audience
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "chk_users_verification_state";

ALTER TABLE "users" ADD CONSTRAINT "chk_users_verification_state" CHECK (
    -- State 0: Global Super Administrator (independent of campus student/faculty audience)
    ("role" = 'SUPER_ADMIN'
        AND "audience" IS NULL
        AND "verification_status" = 'VERIFIED')
    OR
    -- State 1: Active VERIFIED user (must have audience, method, and verified_at)
    ("verification_status" = 'VERIFIED'::"verification_status_type"
        AND "audience" IS NOT NULL
        AND "verification_method" IS NOT NULL
        AND "verified_at" IS NOT NULL)
    OR
    -- State 2: SUSPENDED user (retains verified audience and method from prior verification; locked out of carpooling)
    ("verification_status" = 'SUSPENDED'::"verification_status_type"
        AND "audience" IS NOT NULL
        AND "verification_method" IS NOT NULL
        AND "verified_at" IS NOT NULL)
    OR
    -- State 3: REJECTED user (ineligible; audience and verified_at must be NULL)
    ("verification_status" = 'REJECTED'::"verification_status_type"
        AND "audience" IS NULL
        AND "verified_at" IS NULL)
    OR
    -- State 4: Initial PENDING registration state (student/faculty registration; awaiting email OTP verification)
    ("verification_status" = 'PENDING'::"verification_status_type"
        AND "audience" IS NULL
        AND "verification_method" IS NULL
        AND "verified_at" IS NULL)
    OR
    -- State 5: PENDING Manual ID Review state (email verified, ID card uploaded; awaiting manual admin review)
    ("verification_status" = 'PENDING'::"verification_status_type"
        AND "audience" IS NOT NULL
        AND "verification_method" IS NOT NULL)
);

COMMIT;
