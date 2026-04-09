-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: 003_remaining
-- Tables: lead_sources, smart_templates, import_job_status, follow_up_configs,
--         custom_fields, pipeline_stages
-- Strategy:
--   Read-only for all account members
--   Write (create/update/delete): ADMIN only, except import_job_status (any member)
-- TAD ref: Section 7.4
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- lead_sources TABLE
-- ─────────────────────────────────────────────

ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_sources_select"
  ON lead_sources
  FOR SELECT
  USING (account_id = auth_account_id());

CREATE POLICY "lead_sources_write_admin"
  ON lead_sources
  FOR ALL
  USING (
    account_id = auth_account_id()
    AND auth_user_role() = 'ADMIN'
  );

-- ─────────────────────────────────────────────
-- smart_templates TABLE
-- ─────────────────────────────────────────────

ALTER TABLE smart_templates ENABLE ROW LEVEL SECURITY;

-- All account members can read templates (needed for surfacing in modals)
CREATE POLICY "smart_templates_select"
  ON smart_templates
  FOR SELECT
  USING (account_id = auth_account_id());

-- Only ADMIN can create/update/delete templates
CREATE POLICY "smart_templates_write_admin"
  ON smart_templates
  FOR ALL
  USING (
    account_id = auth_account_id()
    AND auth_user_role() = 'ADMIN'
  );

-- ─────────────────────────────────────────────
-- import_job_status TABLE
-- ─────────────────────────────────────────────

ALTER TABLE import_job_status ENABLE ROW LEVEL SECURITY;

-- Any account member can read their import jobs
CREATE POLICY "import_job_status_select"
  ON import_job_status
  FOR SELECT
  USING (account_id = auth_account_id());

-- Any account member can create import jobs (they upload CSVs)
CREATE POLICY "import_job_status_insert"
  ON import_job_status
  FOR INSERT
  WITH CHECK (account_id = auth_account_id());

-- UPDATE only via service role (Inngest worker updates progress)
-- No UPDATE policy = JWT users cannot update directly

-- ─────────────────────────────────────────────
-- follow_up_configs TABLE
-- ─────────────────────────────────────────────

ALTER TABLE follow_up_configs ENABLE ROW LEVEL SECURITY;

-- All account members can read follow-up config (reps need schedule)
CREATE POLICY "follow_up_configs_select"
  ON follow_up_configs
  FOR SELECT
  USING (account_id = auth_account_id());

-- Only ADMIN can configure follow-up schedules
CREATE POLICY "follow_up_configs_write_admin"
  ON follow_up_configs
  FOR ALL
  USING (
    account_id = auth_account_id()
    AND auth_user_role() = 'ADMIN'
  );

-- ─────────────────────────────────────────────
-- custom_fields TABLE
-- ─────────────────────────────────────────────

ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;

-- All account members can read field definitions (needed for lead forms)
CREATE POLICY "custom_fields_select"
  ON custom_fields
  FOR SELECT
  USING (account_id = auth_account_id());

-- Only ADMIN can manage custom fields
CREATE POLICY "custom_fields_write_admin"
  ON custom_fields
  FOR ALL
  USING (
    account_id = auth_account_id()
    AND auth_user_role() = 'ADMIN'
  );

-- ─────────────────────────────────────────────
-- pipeline_stages TABLE
-- ─────────────────────────────────────────────

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

-- All account members can read pipeline stages (needed for stage moves, Kanban)
CREATE POLICY "pipeline_stages_select"
  ON pipeline_stages
  FOR SELECT
  USING (account_id = auth_account_id());

-- Only ADMIN can manage pipeline stages
CREATE POLICY "pipeline_stages_write_admin"
  ON pipeline_stages
  FOR ALL
  USING (
    account_id = auth_account_id()
    AND auth_user_role() = 'ADMIN'
  );
