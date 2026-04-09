-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 001_notify_trigger
-- Purpose:   pg_notify trigger on leads table for Supabase Realtime integration.
--            Fires AFTER UPDATE when grade, fit_score, intent_score, or
--            quality_score changes. Sends a lightweight JSON payload over the
--            'lead_updated' channel — the app layer handles all scoring logic.
-- TAD ref:   Section 4.5.1
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_notify_lead_updated()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
BEGIN
  -- Only fire if score or grade actually changed
  IF (
    NEW.grade           IS DISTINCT FROM OLD.grade OR
    NEW.fit_score       IS DISTINCT FROM OLD.fit_score OR
    NEW.intent_score    IS DISTINCT FROM OLD.intent_score OR
    NEW.quality_score   IS DISTINCT FROM OLD.quality_score
  ) THEN
    payload := json_build_object(
      'lead_id',        NEW.id,
      'account_id',     NEW.account_id,
      'grade',          NEW.grade,
      'fit_score',      NEW.fit_score,
      'intent_score',   NEW.intent_score,
      'quality_score',  NEW.quality_score,
      'previous_grade', OLD.grade,
      'updated_at',     NEW.updated_at
    );

    PERFORM pg_notify('lead_updated', payload::text);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate to allow re-runs
DROP TRIGGER IF EXISTS trg_lead_updated ON leads;

CREATE TRIGGER trg_lead_updated
  AFTER UPDATE OF grade, fit_score, intent_score, quality_score
  ON leads
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_lead_updated();
