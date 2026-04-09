-- Add PENDING status to ImportStatus enum
-- Applied: 2026-04-09
-- Note: ALTER TYPE ADD VALUE cannot run inside a transaction in PostgreSQL.
-- These two statements must be run separately (not in a transaction block).

ALTER TYPE "ImportStatus" ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'PROCESSING';
