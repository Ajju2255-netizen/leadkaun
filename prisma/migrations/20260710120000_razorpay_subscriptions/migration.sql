-- Razorpay Subscriptions integration. Purely additive: every column is nullable
-- and no existing row is rewritten, so the manual founder billing path keeps
-- working unchanged.

-- AlterTable
ALTER TABLE "plans" ADD COLUMN "provider_plan_id" TEXT;

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "razorpay_customer_id" TEXT;

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");

-- CreateIndex
CREATE INDEX "webhook_events_processed_at_idx" ON "webhook_events"("processed_at");

-- CreateIndex
-- Webhooks arrive keyed by the provider's subscription id, never by account.
CREATE INDEX "subscriptions_provider_subscription_id_idx" ON "subscriptions"("provider_subscription_id");

-- CreateIndex
-- Idempotency for retried webhooks. Postgres treats NULLs as distinct, so the
-- existing manually-entered rows (provider_ref IS NULL) are unaffected and any
-- number of them may coexist.
CREATE UNIQUE INDEX "payments_provider_provider_ref_key" ON "payments"("provider", "provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_provider_provider_ref_key" ON "invoices"("provider", "provider_ref");
