-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: 002_leads
-- Tables: leads, signals, lead_notes, follow_up_actions, stage_history,
--         win_attributions
-- Strategy:
--   REP: sees only leads assigned to them
--   MANAGER / ADMIN: sees all leads in their account
--   All writes: account-scoped (no cross-account writes)
-- TAD ref: Section 7.3
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- leads TABLE
-- ─────────────────────────────────────────────

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- SELECT: rep sees assigned leads; manager/admin sees all in account
CREATE POLICY "leads_select"
  ON leads
  FOR SELECT
  USING (
    account_id = auth_account_id()
    AND (
      auth_user_role() IN ('ADMIN', 'MANAGER')
      OR assigned_rep_id = (SELECT id FROM users WHERE auth_id = auth_user_id() LIMIT 1)
    )
  );

-- INSERT: any account member (via API, service role bypasses for imports)
CREATE POLICY "leads_insert"
  ON leads
  FOR INSERT
  WITH CHECK (account_id = auth_account_id());

-- UPDATE: rep can update assigned leads; admin/manager can update all in account
CREATE POLICY "leads_update"
  ON leads
  FOR UPDATE
  USING (
    account_id = auth_account_id()
    AND (
      auth_user_role() IN ('ADMIN', 'MANAGER')
      OR assigned_rep_id = (SELECT id FROM users WHERE auth_id = auth_user_id() LIMIT 1)
    )
  );

-- DELETE: admin only
CREATE POLICY "leads_delete_admin_only"
  ON leads
  FOR DELETE
  USING (
    account_id = auth_account_id()
    AND auth_user_role() = 'ADMIN'
  );

-- ─────────────────────────────────────────────
-- signals TABLE
-- ─────────────────────────────────────────────

ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

-- SELECT: same visibility as leads (via account_id)
CREATE POLICY "signals_select"
  ON signals
  FOR SELECT
  USING (
    account_id = auth_account_id()
    AND (
      auth_user_role() IN ('ADMIN', 'MANAGER')
      OR EXISTS (
        SELECT 1 FROM leads l
        WHERE l.id = signals.lead_id
          AND l.assigned_rep_id = (SELECT id FROM users WHERE auth_id = auth_user_id() LIMIT 1)
      )
    )
  );

-- INSERT: any account member (API writes signals after interactions)
CREATE POLICY "signals_insert"
  ON signals
  FOR INSERT
  WITH CHECK (account_id = auth_account_id());

-- No UPDATE or DELETE on signals (immutable audit trail)

-- ─────────────────────────────────────────────
-- lead_notes TABLE
-- ─────────────────────────────────────────────

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;

-- SELECT: same visibility as leads
CREATE POLICY "lead_notes_select"
  ON lead_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_notes.lead_id
        AND l.account_id = auth_account_id()
        AND (
          auth_user_role() IN ('ADMIN', 'MANAGER')
          OR l.assigned_rep_id = (SELECT id FROM users WHERE auth_id = auth_user_id() LIMIT 1)
        )
    )
  );

-- INSERT: any account member can add notes
CREATE POLICY "lead_notes_insert"
  ON lead_notes
  FOR INSERT
  WITH CHECK (
    user_id = (SELECT id FROM users WHERE auth_id = auth_user_id() LIMIT 1)
    AND EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_notes.lead_id
        AND l.account_id = auth_account_id()
    )
  );

-- No UPDATE (notes are immutable once created)
-- DELETE: admin only (not exposed in UI)

-- ─────────────────────────────────────────────
-- follow_up_actions TABLE
-- ─────────────────────────────────────────────

ALTER TABLE follow_up_actions ENABLE ROW LEVEL SECURITY;

-- SELECT: rep sees own follow-ups; manager/admin sees all in account
CREATE POLICY "follow_up_actions_select"
  ON follow_up_actions
  FOR SELECT
  USING (
    account_id = auth_account_id()
    AND (
      auth_user_role() IN ('ADMIN', 'MANAGER')
      OR assigned_rep_id = (SELECT id FROM users WHERE auth_id = auth_user_id() LIMIT 1)
    )
  );

-- INSERT: account-scoped (Inngest and API create follow-ups)
CREATE POLICY "follow_up_actions_insert"
  ON follow_up_actions
  FOR INSERT
  WITH CHECK (account_id = auth_account_id());

-- UPDATE: rep can update assigned actions; manager/admin can update all
CREATE POLICY "follow_up_actions_update"
  ON follow_up_actions
  FOR UPDATE
  USING (
    account_id = auth_account_id()
    AND (
      auth_user_role() IN ('ADMIN', 'MANAGER')
      OR assigned_rep_id = (SELECT id FROM users WHERE auth_id = auth_user_id() LIMIT 1)
    )
  );

-- ─────────────────────────────────────────────
-- stage_history TABLE
-- ─────────────────────────────────────────────

ALTER TABLE stage_history ENABLE ROW LEVEL SECURITY;

-- SELECT: same visibility as leads
CREATE POLICY "stage_history_select"
  ON stage_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = stage_history.lead_id
        AND l.account_id = auth_account_id()
        AND (
          auth_user_role() IN ('ADMIN', 'MANAGER')
          OR l.assigned_rep_id = (SELECT id FROM users WHERE auth_id = auth_user_id() LIMIT 1)
        )
    )
  );

-- INSERT: any account member (stage moves recorded by API)
CREATE POLICY "stage_history_insert"
  ON stage_history
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = stage_history.lead_id
        AND l.account_id = auth_account_id()
    )
  );

-- No UPDATE or DELETE (immutable history)

-- ─────────────────────────────────────────────
-- win_attributions TABLE
-- ─────────────────────────────────────────────

ALTER TABLE win_attributions ENABLE ROW LEVEL SECURITY;

-- SELECT: any account member (manager sees team attributions)
CREATE POLICY "win_attributions_select"
  ON win_attributions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = win_attributions.lead_id
        AND l.account_id = auth_account_id()
    )
  );

-- INSERT: account-scoped (API writes on won outcome)
CREATE POLICY "win_attributions_insert"
  ON win_attributions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = win_attributions.lead_id
        AND l.account_id = auth_account_id()
    )
  );

-- No UPDATE or DELETE (immutable)
