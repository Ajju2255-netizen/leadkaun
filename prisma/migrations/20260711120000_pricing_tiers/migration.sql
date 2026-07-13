-- New pricing model (2026-07-11): Free / Starter / Growth / Scale / Enterprise,
-- priced by team size AND active-lead volume, premium features gated by tier.
--
-- Additive column + data updates. The `trial` row is repurposed as the "Free"
-- tier (it stays the DEFAULT_PLAN_KEY fallback for accounts with no subscription
-- in lib/billing/seats.ts, so new signups land on Free automatically).

-- AlterTable: cap on ACTIVE leads (open — not won/lost/junk). Null = unlimited.
-- Soft paywall: at the cap, existing leads stay usable; only new ones are blocked.
ALTER TABLE "plans" ADD COLUMN "active_lead_limit" INTEGER;

-- The default for max_seats drops to 1 (Free floor). Existing rows are set
-- explicitly below, so no row is left on a stale default.
ALTER TABLE "plans" ALTER COLUMN "max_seats" SET DEFAULT 1;

-- Free (repurposed `trial`): 1 user, 100 leads/mo. Not sold online.
UPDATE "plans" SET "name" = 'Free',    "price_inr" = 0,       "max_seats" = 1,  "active_lead_limit" = 100   WHERE "key" = 'trial';
UPDATE "plans" SET "name" = 'Starter', "price_inr" = 299900,  "max_seats" = 10, "active_lead_limit" = 5000  WHERE "key" = 'starter';
UPDATE "plans" SET "name" = 'Growth',  "price_inr" = 799900,  "max_seats" = 30, "active_lead_limit" = 25000 WHERE "key" = 'growth';
UPDATE "plans" SET "name" = 'Scale',   "price_inr" = 1999900, "max_seats" = 75, "active_lead_limit" = NULL  WHERE "key" = 'scale';

-- Enterprise: custom pricing, unlimited everything, sold via sales (no online
-- checkout → no provider_plan_id). Idempotent.
INSERT INTO "plans" ("id","key","name","price_inr","is_active","max_seats","active_lead_limit") VALUES
 ('plan_enterprise','enterprise','Enterprise',0,true,1000000,NULL)
ON CONFLICT ("id") DO NOTHING;
