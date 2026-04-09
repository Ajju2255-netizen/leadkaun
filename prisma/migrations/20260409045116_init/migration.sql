-- Extensions for full-text search (Supabase may already have these; IF NOT EXISTS is safe)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'REP');

-- CreateEnum
CREATE TYPE "TeamSize" AS ENUM ('SOLO', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "LeadVolume" AS ENUM ('UNDER_50', 'BETWEEN_50_200', 'BETWEEN_200_500', 'BETWEEN_500_1000', 'OVER_1000');

-- CreateEnum
CREATE TYPE "SalesCycle" AS ENUM ('SAME_DAY', 'THREE_DAYS', 'TWO_WEEKS', 'FOUR_WEEKS', 'THREE_MONTHS', 'OVER_THREE_MONTHS');

-- CreateEnum
CREATE TYPE "LeadGrade" AS ENUM ('A', 'B', 'C', 'D', 'E', 'F');

-- CreateEnum
CREATE TYPE "WaStage" AS ENUM ('INQUIRY', 'DISCUSSION', 'NEGOTIATION', 'CLOSING', 'STALLED');

-- CreateEnum
CREATE TYPE "WinReason" AS ENUM ('COMPETITIVE_PRICE', 'BEST_FIT', 'REFERRAL_TRUST', 'FAST_DELIVERY', 'EXISTING_RELATIONSHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "LossReason" AS ENUM ('PRICE_TOO_HIGH', 'WENT_COMPETITOR', 'NO_BUDGET', 'NO_RESPONSE', 'REQUIREMENT_CHANGED', 'WRONG_FIT', 'OTHER');

-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('CALL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'OVERDUE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('WHATSAPP', 'CALL_SCRIPT');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PROCESSING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "AttributionType" AS ENUM ('FULL', 'CONTRIBUTED');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('WA_REPLIED_1H', 'WA_REPLIED_4H', 'WA_REPLIED_24H', 'WA_NO_REPLY', 'WA_TAG_ASKED_PRICING', 'WA_TAG_BROCHURE', 'WA_TAG_NEGOTIATING', 'WA_TAG_COMPARING', 'WA_TAG_DECISION_PENDING', 'WA_TAG_NOT_SERIOUS', 'WA_TAG_GENERAL_CHAT', 'WA_TAG_WRONG_NUMBER', 'WA_STAGE_ADVANCED', 'WA_STAGE_REGRESSED', 'CALL_ANSWERED_INTERESTED', 'CALL_ANSWERED_NOT_INTERESTED', 'CALL_ANSWERED_CALLBACK', 'CALL_ANSWERED_WRONG_NUMBER', 'CALL_NOT_ANSWERED', 'CALL_BUSY', 'CALL_INVALID', 'CALL_VOICEMAIL', 'INQUIRY_HIGH_SPECIFICITY', 'INQUIRY_MED_SPECIFICITY', 'SOURCE_BASELINE', 'RE_INQUIRY', 'INQUIRY_EVENING_WEEKEND', 'STAGE_PROPOSAL_SENT', 'EMAIL_OPENED', 'EMAIL_CLICKED', 'REP_VERY_INTERESTED', 'REP_NOT_INTERESTED', 'INTENT_DECAY');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "team_size" "TeamSize" NOT NULL,
    "monthly_lead_vol" "LeadVolume" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "icp_configured" BOOLEAN NOT NULL DEFAULT false,
    "icp_industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "icp_states" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "icp_business_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "icp_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "icp_budget_min" INTEGER,
    "icp_budget_max" INTEGER,
    "icp_sales_cycle" "SalesCycle" NOT NULL DEFAULT 'FOUR_WEEKS',
    "sql_fit_threshold" INTEGER NOT NULL DEFAULT 55,
    "sql_intent_threshold" INTEGER NOT NULL DEFAULT 45,
    "weight_overrides" JSONB,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "auth_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "invited_by" TEXT,
    "invited_at" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "assigned_rep_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "phone" TEXT NOT NULL,
    "phone_raw" TEXT NOT NULL,
    "email" TEXT,
    "company_name" TEXT,
    "designation" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "source_id" TEXT NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inquiry_text" TEXT,
    "expected_value" INTEGER,
    "fit_score" INTEGER NOT NULL DEFAULT 0,
    "intent_score" INTEGER NOT NULL DEFAULT 0,
    "quality_score" INTEGER NOT NULL DEFAULT 0,
    "grade" "LeadGrade" NOT NULL DEFAULT 'E',
    "fit_score_breakdown" JSONB,
    "intent_score_baseline" INTEGER NOT NULL DEFAULT 0,
    "quality_score_breakdown" JSONB,
    "grade_changed_at" TIMESTAMP(3),
    "previous_grade" "LeadGrade",
    "is_sql" BOOLEAN NOT NULL DEFAULT false,
    "sql_crossed_at" TIMESTAMP(3),
    "handoff_brief" TEXT,
    "first_contact_at" TIMESTAMP(3),
    "speed_to_lead_hours" DOUBLE PRECISION,
    "stage_id" TEXT NOT NULL,
    "stage_entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_junk" BOOLEAN NOT NULL DEFAULT false,
    "junk_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_fatigued" BOOLEAN NOT NULL DEFAULT false,
    "fatigue_contact_count" INTEGER NOT NULL DEFAULT 0,
    "is_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "wa_conversation_stage" "WaStage" NOT NULL DEFAULT 'INQUIRY',
    "won_at" TIMESTAMP(3),
    "lost_at" TIMESTAMP(3),
    "won_value" INTEGER,
    "win_reason" "WinReason",
    "loss_reason" "LossReason",
    "outcome_snapshot" JSONB,
    "custom_values" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signals" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "user_id" TEXT,
    "signal_type" "SignalType" NOT NULL,
    "signal_value" DOUBLE PRECISION NOT NULL,
    "raw_value" JSONB,
    "lead_grade_at_signal" "LeadGrade" NOT NULL,
    "intent_score_before" INTEGER NOT NULL,
    "intent_score_after" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_notes" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "is_won" BOOLEAN NOT NULL DEFAULT false,
    "is_lost" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_history" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "from_stage_id" TEXT,
    "to_stage_id" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_actions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "assigned_rep_id" TEXT NOT NULL,
    "day_number" INTEGER NOT NULL,
    "action_type" "FollowUpType" NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMP(3),
    "completed_by" TEXT,
    "is_overdue" BOOLEAN NOT NULL DEFAULT false,
    "show_tip" BOOLEAN NOT NULL DEFAULT false,
    "tip_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_up_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_configs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "grade" "LeadGrade" NOT NULL,
    "schedule" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_up_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_sources" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "intent_baseline" INTEGER NOT NULL DEFAULT 10,
    "reliability_score" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "win_attributions" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "attribution_type" "AttributionType" NOT NULL,
    "won_value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "win_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_templates" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TemplateType" NOT NULL,
    "stages" TEXT[],
    "grades" "LeadGrade"[],
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smart_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_job_status" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "progress_pct" INTEGER NOT NULL DEFAULT 0,
    "error_detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "import_job_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_fields" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "field_type" "FieldType" NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "display_order" INTEGER NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_id_key" ON "users"("auth_id");

-- CreateIndex
CREATE INDEX "users_account_id_idx" ON "users"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_account_id_email_key" ON "users"("account_id", "email");

-- CreateIndex
CREATE INDEX "leads_account_id_idx" ON "leads"("account_id");

-- CreateIndex
CREATE INDEX "leads_account_id_assigned_rep_id_idx" ON "leads"("account_id", "assigned_rep_id");

-- CreateIndex
CREATE INDEX "leads_account_id_stage_id_idx" ON "leads"("account_id", "stage_id");

-- CreateIndex
CREATE INDEX "leads_account_id_is_sql_idx" ON "leads"("account_id", "is_sql");

-- CreateIndex
CREATE INDEX "leads_account_id_imported_at_idx" ON "leads"("account_id", "imported_at");

-- CreateIndex
CREATE INDEX "leads_account_id_is_junk_idx" ON "leads"("account_id", "is_junk");

-- CreateIndex
CREATE UNIQUE INDEX "leads_account_id_phone_key" ON "leads"("account_id", "phone");

-- CreateIndex
CREATE INDEX "signals_lead_id_idx" ON "signals"("lead_id");

-- CreateIndex
CREATE INDEX "signals_lead_id_created_at_idx" ON "signals"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "signals_account_id_idx" ON "signals"("account_id");

-- CreateIndex
CREATE INDEX "signals_account_id_created_at_idx" ON "signals"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_notes_lead_id_idx" ON "lead_notes"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_account_id_key_key" ON "pipeline_stages"("account_id", "key");

-- CreateIndex
CREATE INDEX "stage_history_lead_id_idx" ON "stage_history"("lead_id");

-- CreateIndex
CREATE INDEX "follow_up_actions_lead_id_idx" ON "follow_up_actions"("lead_id");

-- CreateIndex
CREATE INDEX "follow_up_actions_account_id_due_date_idx" ON "follow_up_actions"("account_id", "due_date");

-- CreateIndex
CREATE INDEX "follow_up_actions_assigned_rep_id_due_date_idx" ON "follow_up_actions"("assigned_rep_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_configs_account_id_grade_key" ON "follow_up_configs"("account_id", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_account_id_key_key" ON "lead_sources"("account_id", "key");

-- CreateIndex
CREATE INDEX "import_job_status_account_id_idx" ON "import_job_status"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_fields_account_id_key_key" ON "custom_fields"("account_id", "key");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_rep_id_fkey" FOREIGN KEY ("assigned_rep_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "lead_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_actions" ADD CONSTRAINT "follow_up_actions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_configs" ADD CONSTRAINT "follow_up_configs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "win_attributions" ADD CONSTRAINT "win_attributions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "win_attributions" ADD CONSTRAINT "win_attributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_templates" ADD CONSTRAINT "smart_templates_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
