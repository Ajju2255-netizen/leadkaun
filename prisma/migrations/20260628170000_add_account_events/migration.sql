-- CreateEnum
CREATE TYPE "AccountEventType" AS ENUM ('SIGNUP', 'ICP_CONFIGURED', 'WORKSPACE_CREATED', 'WORKSPACE_ARCHIVED', 'USER_INVITED', 'USER_JOINED', 'USER_DEACTIVATED', 'IMPORT_COMPLETED', 'IMPORT_FAILED', 'PLAN_CHANGED', 'TRIAL_STARTED', 'TRIAL_ENDED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'FEATURE_FLAG_CHANGED', 'IMPERSONATED');

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "signup_country" TEXT,
ADD COLUMN     "signup_ip" TEXT,
ADD COLUMN     "signup_utm_campaign" TEXT,
ADD COLUMN     "signup_utm_source" TEXT;

-- CreateTable
CREATE TABLE "account_events" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "actor_user_id" TEXT,
    "type" "AccountEventType" NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_events_account_id_created_at_idx" ON "account_events"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "account_events_type_created_at_idx" ON "account_events"("type", "created_at");

