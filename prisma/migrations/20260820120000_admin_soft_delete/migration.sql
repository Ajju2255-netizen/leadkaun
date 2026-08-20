-- Platform-admin soft delete.
--
-- "Deleted from Leadkaun" means the customer loses access and the record leaves
-- every admin list, while the row and all its children stay intact in the
-- database. Nothing here destroys data, so an accidental delete costs a click
-- to undo rather than a restore from backup.
--
-- Deliberately separate from the states that already exist and mean other
-- things: users.is_active is an in-product deactivation an account ADMIN can do
-- themselves, workspaces.archived_at is a customer tidy-up that keeps the
-- workspace reachable, and leads.is_junk is a scoring outcome. Overloading any
-- of those would have made "deleted" unreadable from the data alone.
ALTER TABLE "accounts"   ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "users"      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "leads"      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- Every product and admin read filters on deleted_at IS NULL, so these are hot.
-- Partial indexes: the live set is what gets queried, and it stays small even
-- as deleted rows accumulate.
CREATE INDEX IF NOT EXISTS "accounts_deleted_at_idx"   ON "accounts"   ("deleted_at") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "users_deleted_at_idx"      ON "users"      ("deleted_at") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "workspaces_deleted_at_idx" ON "workspaces" ("deleted_at") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "leads_deleted_at_idx"      ON "leads"      ("deleted_at") WHERE "deleted_at" IS NULL;

-- Audit types for the deletion itself. Separate statements: Postgres will not
-- add an enum value and use it inside one transaction.
ALTER TYPE "AccountEventType" ADD VALUE IF NOT EXISTS 'RECORD_SOFT_DELETED';
ALTER TYPE "AccountEventType" ADD VALUE IF NOT EXISTS 'RECORD_RESTORED';
