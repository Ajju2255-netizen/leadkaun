-- Data Freshness (FM-22): approximate source-collection date, captured at
-- import. Additive, nullable — zero data risk, instant metadata-only change.
-- Rollback: ALTER TABLE "leads" DROP COLUMN "source_collected_at";
ALTER TABLE "leads" ADD COLUMN "source_collected_at" TIMESTAMP(3);
