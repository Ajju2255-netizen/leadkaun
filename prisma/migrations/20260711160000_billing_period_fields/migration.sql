-- Billing model completeness: billing cycle + current paid period on the
-- subscription, so the app can show a renewal date and distinguish monthly vs
-- annual. Additive, all nullable. Period bounds are populated by the provider
-- webhook (subscription.charged); billing_cycle is set at subscription creation.
ALTER TABLE "subscriptions" ADD COLUMN "billing_cycle"        TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "current_period_start" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN "current_period_end"   TIMESTAMP(3);
