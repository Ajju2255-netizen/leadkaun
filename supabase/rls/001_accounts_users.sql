-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: 001_accounts_users
-- Tables: accounts, users
-- Strategy:
--   accounts: member of account can read; only ADMIN can update
--   users: member of same account can read; users can update own row
-- TAD ref: Section 7.2
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- HELPER FUNCTIONS
-- ─────────────────────────────────────────────

-- Returns auth.uid() cast to text (Supabase JWT sub)
CREATE OR REPLACE FUNCTION auth_user_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT auth.uid()::text;
$$;

-- Returns the account_id for the current authenticated user
CREATE OR REPLACE FUNCTION auth_account_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT account_id
  FROM users
  WHERE auth_id = auth.uid()::text
  LIMIT 1;
$$;

-- Returns the role (ADMIN | MANAGER | REP) for the current authenticated user
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role::text
  FROM users
  WHERE auth_id = auth.uid()::text
  LIMIT 1;
$$;

-- ─────────────────────────────────────────────
-- accounts TABLE
-- ─────────────────────────────────────────────

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user who belongs to this account
CREATE POLICY "accounts_select_own"
  ON accounts
  FOR SELECT
  USING (id = auth_account_id());

-- UPDATE: only ADMIN role
CREATE POLICY "accounts_update_admin_only"
  ON accounts
  FOR UPDATE
  USING (
    id = auth_account_id()
    AND auth_user_role() = 'ADMIN'
  );

-- INSERT: only service role (account creation happens via admin client)
-- (no INSERT policy = blocked for all JWT users)

-- DELETE: blocked for all
-- (no DELETE policy = blocked for all JWT users)

-- ─────────────────────────────────────────────
-- users TABLE
-- ─────────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- SELECT: any user in the same account can see all users
CREATE POLICY "users_select_same_account"
  ON users
  FOR SELECT
  USING (account_id = auth_account_id());

-- UPDATE: user can update their own row; ADMIN can update any user in account
CREATE POLICY "users_update_self_or_admin"
  ON users
  FOR UPDATE
  USING (
    auth_id = auth_user_id()
    OR (
      account_id = auth_account_id()
      AND auth_user_role() = 'ADMIN'
    )
  );

-- INSERT: only service role (invitations handled via admin client)

-- DELETE: only service role (deactivation is a soft delete via is_active flag)
