-- Intake sessions: the lifecycle memory of every dataset entering Leadkaun.
-- Stores a structural hash + metadata + the frozen report + internal scores +
-- the Time-to-Trust timeline. NEVER stores raw customer rows.

-- CreateEnum
CREATE TYPE "IntakeSource" AS ENUM ('CSV', 'GOOGLE_SHEETS', 'MANUAL', 'API');

-- CreateEnum
CREATE TYPE "IntakeOutcome" AS ENUM ('ANALYSING', 'APPROVED', 'ABANDONED', 'CANCELLED', 'FAILED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "IntakeAbandonReason" AS ENUM ('TOO_MANY_DUPLICATES', 'NEED_TO_CLEAN_CSV', 'WRONG_MAPPING', 'OTHER');

-- CreateTable
CREATE TABLE "intake_sessions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "user_id" TEXT,
    "upload_source" "IntakeSource" NOT NULL,
    "rows" INTEGER NOT NULL,
    "columns" INTEGER NOT NULL,
    "sample_hash" TEXT,
    "detected_country" TEXT,
    "detected_currency" TEXT,
    "detected_business_type" TEXT,
    "mapping_version" TEXT NOT NULL,
    "analysis_version" TEXT NOT NULL,
    "engine_version" TEXT NOT NULL,
    "report" JSONB NOT NULL,
    "import_intelligence_score" INTEGER,
    "mapping_confidence" INTEGER,
    "contact_quality" INTEGER,
    "business_context" INTEGER,
    "completeness" INTEGER,
    "upload_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analysis_finished_at" TIMESTAMP(3),
    "report_viewed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "import_started_at" TIMESTAMP(3),
    "import_completed_at" TIMESTAMP(3),
    "analysis_duration_ms" INTEGER,
    "outcome" "IntakeOutcome" NOT NULL DEFAULT 'ANALYSING',
    "abandon_reason" "IntakeAbandonReason",
    "import_job_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intake_sessions_account_id_created_at_idx" ON "intake_sessions"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "intake_sessions_workspace_id_outcome_idx" ON "intake_sessions"("workspace_id", "outcome");

-- CreateIndex
CREATE INDEX "intake_sessions_account_id_sample_hash_idx" ON "intake_sessions"("account_id", "sample_hash");
