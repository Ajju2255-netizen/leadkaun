-- Recommendation-interaction telemetry: the raw dataset behind RAR / RSR.
-- Kept in its own table (not lead_score_events) so SHOWN/EXPANDED volume never
-- pollutes the user-facing score timeline.

-- CreateEnum
CREATE TYPE "RecommendationEventType" AS ENUM ('SHOWN', 'EXPANDED', 'ACCEPTED', 'IGNORED', 'DISMISSED', 'EXECUTED', 'OUTCOME');

-- CreateEnum
CREATE TYPE "RecommendationSkipReason" AS ENUM ('ALREADY_DOING_IT', 'WRONG_RECOMMENDATION', 'NEED_MORE_INFO', 'NOT_RELEVANT', 'OTHER');

-- CreateTable
CREATE TABLE "recommendation_events" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "lead_id" TEXT NOT NULL,
    "user_id" TEXT,
    "event" "RecommendationEventType" NOT NULL,
    "action_label" TEXT,
    "grade_at_event" TEXT,
    "confidence_band" TEXT,
    "skip_reason" "RecommendationSkipReason",
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendation_events_account_id_event_created_at_idx" ON "recommendation_events"("account_id", "event", "created_at");

-- CreateIndex
CREATE INDEX "recommendation_events_lead_id_created_at_idx" ON "recommendation_events"("lead_id", "created_at");

-- AddForeignKey
ALTER TABLE "recommendation_events" ADD CONSTRAINT "recommendation_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
