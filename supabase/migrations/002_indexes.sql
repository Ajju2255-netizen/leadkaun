-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 002_indexes
-- Purpose:   Performance indexes for high-traffic query patterns.
--            Prisma handles basic indexes via @@index() in schema.prisma.
--            These are additional composite indexes for dashboard, queue,
--            analytics, and follow-up queries.
-- TAD ref:   Section 10.1
-- ─────────────────────────────────────────────────────────────────────────────

-- leads: grade filter (analytics grade distribution, grade-filtered list)
CREATE INDEX IF NOT EXISTS idx_leads_account_grade
  ON leads (account_id, grade);

-- leads: time-based queries (import feed, missed opportunity engine)
CREATE INDEX IF NOT EXISTS idx_leads_account_imported_at
  ON leads (account_id, imported_at DESC);

-- leads: SQL status queries (SQL crossed tracking)
CREATE INDEX IF NOT EXISTS idx_leads_account_sql
  ON leads (account_id, is_sql, sql_crossed_at)
  WHERE is_sql = true;

-- leads: won/lost value queries (analytics revenue, source truth cards)
CREATE INDEX IF NOT EXISTS idx_leads_account_won
  ON leads (account_id, won_at DESC)
  WHERE won_at IS NOT NULL;

-- leads: junk filtering (exclude from queue and list)
CREATE INDEX IF NOT EXISTS idx_leads_account_not_junk
  ON leads (account_id, grade, assigned_rep_id)
  WHERE is_junk = false;

-- signals: intent decay job (batch updates by lead)
CREATE INDEX IF NOT EXISTS idx_signals_lead_created
  ON signals (lead_id, created_at DESC);

-- signals: account-level analytics (source signal analysis)
CREATE INDEX IF NOT EXISTS idx_signals_account_type
  ON signals (account_id, signal_type, created_at DESC);

-- follow_up_actions: rep daily queue (today's due actions)
CREATE INDEX IF NOT EXISTS idx_follow_up_rep_due_status
  ON follow_up_actions (assigned_rep_id, due_date, status);

-- follow_up_actions: account-level overdue job
CREATE INDEX IF NOT EXISTS idx_follow_up_account_due_status
  ON follow_up_actions (account_id, due_date, status);

-- stage_history: pipeline velocity analytics
CREATE INDEX IF NOT EXISTS idx_stage_history_lead_created
  ON stage_history (lead_id, created_at DESC);
