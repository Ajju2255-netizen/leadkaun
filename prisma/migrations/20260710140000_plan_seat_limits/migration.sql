-- Seat limits per plan. Additive: one NOT NULL column with a default, then the
-- per-tier values. No existing row is otherwise touched.
--
-- The default of 10 is the conservative floor (Starter). Any future plan row
-- that forgets to set max_seats gets the smallest limit rather than unlimited.

-- AlterTable
ALTER TABLE "plans" ADD COLUMN "max_seats" INTEGER NOT NULL DEFAULT 10;

-- Per-tier seat limits, matching the published pricing page.
--   trial   → 30, same as Growth ("full Growth-tier feature access" in the FAQ)
--   starter → 10
--   growth  → 30
--   scale   → 50
UPDATE "plans" SET "max_seats" = 30 WHERE "key" = 'trial';
UPDATE "plans" SET "max_seats" = 10 WHERE "key" = 'starter';
UPDATE "plans" SET "max_seats" = 30 WHERE "key" = 'growth';
UPDATE "plans" SET "max_seats" = 50 WHERE "key" = 'scale';
