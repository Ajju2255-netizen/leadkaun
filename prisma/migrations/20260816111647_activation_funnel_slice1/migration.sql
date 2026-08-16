-- Slice 1: activation funnel instrumentation.
--
-- Adds the funnel event types and separates "finished the wizard" from
-- "configured an ICP". Activation itself is derived (an IMPORT_COMPLETED
-- event exists), so it needs no column.
--
-- Safe to run before or after the application deploy: recordAccountEvent
-- swallows write failures, so events simply no-op until this lands.

ALTER TYPE "AccountEventType" ADD VALUE IF NOT EXISTS 'ONBOARDING_STARTED';
ALTER TYPE "AccountEventType" ADD VALUE IF NOT EXISTS 'IMPORT_STARTED';
ALTER TYPE "AccountEventType" ADD VALUE IF NOT EXISTS 'ANALYSIS_COMPLETED';
ALTER TYPE "AccountEventType" ADD VALUE IF NOT EXISTS 'REPORT_VIEWED';
ALTER TYPE "AccountEventType" ADD VALUE IF NOT EXISTS 'IMPORT_APPROVED';
ALTER TYPE "AccountEventType" ADD VALUE IF NOT EXISTS 'FIRST_PRIORITY_VIEWED';

ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" TIMESTAMP(3);
