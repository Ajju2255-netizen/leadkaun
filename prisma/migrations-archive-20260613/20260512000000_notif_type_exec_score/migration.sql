-- Add notification types for the daily Execution Score alert (3pm IST) and
-- the future 5-component Rep Score drop signal. PostgreSQL ALTER TYPE ...
-- ADD VALUE is non-destructive and irreversible, so IF NOT EXISTS guards are
-- used to make this migration idempotent (matches the established convention
-- in 20260410000000_import_signal_types).

ALTER TYPE "NotifType" ADD VALUE IF NOT EXISTS 'EXEC_SCORE_LOW';
ALTER TYPE "NotifType" ADD VALUE IF NOT EXISTS 'REP_SCORE_DROP';
