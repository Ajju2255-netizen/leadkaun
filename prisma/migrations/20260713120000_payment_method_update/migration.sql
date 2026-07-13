-- "Update payment method": Razorpay has no card-swap API, so we re-authorise on
-- a new subscription. This column holds the pending replacement's id until it
-- activates; the webhook then cancels the old sub at cycle end and swaps.
ALTER TABLE "subscriptions" ADD COLUMN "pending_provider_subscription_id" TEXT;
