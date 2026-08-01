-- Intake sessions: the lifecycle memory of every dataset entering Leadkaun.
-- Stores a structural hash + metadata + the frozen report + internal scores +
-- the Time-to-Trust timeline + a state machine. NEVER stores raw customer rows.
-- Plus an immutable, append-only per-session event timeline.

-- CreateEnum
CREATE TYPE "IntakeSource" AS ENUM ('CSV', 'GOOGLE_SHEETS', 'MANUAL', 'API');

-- CreateEnum
CREATE TYPE "IntakeState" AS ENUM ('CREATED', 'ANALYSING', 'REPORT_READY', 'VIEWED', 'APPROVED', 'IMPORTING', 'COMPLETED', 'ABANDONED', 'CANCELLED', 'FAILED');

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
    "state" "IntakeState" NOT NULL DEFAULT 'CREATED',
    "abandon_reason" "IntakeAbandonReason",
    "import_job_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_session_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "state" "IntakeState" NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_session_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intake_sessions_account_id_created_at_idx" ON "intake_sessions"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "intake_sessions_workspace_id_state_idx" ON "intake_sessions"("workspace_id", "state");

-- CreateIndex
CREATE INDEX "intake_sessions_account_id_sample_hash_idx" ON "intake_sessions"("account_id", "sample_hash");

-- CreateIndex
CREATE INDEX "intake_session_events_session_id_at_idx" ON "intake_session_events"("session_id", "at");

-- AddForeignKey
ALTER TABLE "intake_session_events" ADD CONSTRAINT "intake_session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "intake_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
