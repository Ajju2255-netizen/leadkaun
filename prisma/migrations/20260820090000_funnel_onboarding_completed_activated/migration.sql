-- Two activation milestones that had no durable record.
--
-- ONBOARDING_COMPLETED existed only as accounts.onboarding_completed_at, so it
-- was invisible to the AccountEvent funnel. ACTIVATED was derived on every read
-- in lib/admin/growth.ts as "completed an import AND logged a real rep action",
-- which meant the moment it happened was never recorded — only that it had.
--
-- Postgres cannot add enum values inside a transaction that also uses them, so
-- these are separate statements. IF NOT EXISTS keeps the migration idempotent.
ALTER TYPE "AccountEventType" ADD VALUE IF NOT EXISTS 'ONBOARDING_COMPLETED';
ALTER TYPE "AccountEventType" ADD VALUE IF NOT EXISTS 'ACTIVATED';
