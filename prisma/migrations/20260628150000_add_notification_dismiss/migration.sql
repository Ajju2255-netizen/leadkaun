-- Alert feedback (FM-14): let users dismiss an alert and record why, so the
-- feed stays clean and we can learn which alerts are noise. Additive, nullable.
-- Rollback: ALTER TABLE "notifications" DROP COLUMN "dismissed_at", DROP COLUMN "dismiss_reason";
ALTER TABLE "notifications" ADD COLUMN "dismissed_at" TIMESTAMP(3);
ALTER TABLE "notifications" ADD COLUMN "dismiss_reason" TEXT;
