-- Score Evolution timeline: append-only per-lead score/grade/confidence events.
-- Additive (new enum + new table + FK to leads). No change to existing tables.
-- Rollback: DROP TABLE "lead_score_events"; DROP TYPE "ScoreEventKind";

-- CreateEnum
CREATE TYPE "ScoreEventKind" AS ENUM ('CREATED', 'ENRICHED', 'ACTIVITY', 'GRADE_CHANGE', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "lead_score_events" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "lead_id" TEXT NOT NULL,
    "kind" "ScoreEventKind" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grade" "LeadGrade" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "fit_score" INTEGER NOT NULL,
    "intent_score" INTEGER NOT NULL,
    "quality_score" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" JSONB,

    CONSTRAINT "lead_score_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_score_events_lead_id_occurred_at_idx" ON "lead_score_events"("lead_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "lead_score_events" ADD CONSTRAINT "lead_score_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
