-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_inr" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trialing',
    "mrr_inr" INTEGER NOT NULL DEFAULT 0,
    "trial_ends_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceled_at" TIMESTAMP(3),
    "provider" TEXT,
    "provider_subscription_id" TEXT,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "amount_inr" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'succeeded',
    "provider" TEXT,
    "provider_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "number" TEXT,
    "amount_inr" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "pdf_url" TEXT,
    "provider" TEXT,
    "provider_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_account_id_key" ON "subscriptions"("account_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "payments_account_id_created_at_idx" ON "payments"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE INDEX "invoices_account_id_created_at_idx" ON "invoices"("account_id", "created_at");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Seed default plans (prices in paise). Idempotent.
INSERT INTO "plans" ("id","key","name","price_inr","is_active") VALUES
 ('plan_trial','trial','Trial',0,true),
 ('plan_starter','starter','Starter',299900,true),
 ('plan_growth','growth','Growth',750000,true),
 ('plan_scale','scale','Scale',2000000,true)
ON CONFLICT ("id") DO NOTHING;
