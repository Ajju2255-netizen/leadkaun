-- Phase 3 billing portal: saved-card display fields (network + last4 only, no
-- PAN — safe to store). Captured from the charged webhook's card payment.
ALTER TABLE "subscriptions" ADD COLUMN "card_last4"   TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "card_network" TEXT;
