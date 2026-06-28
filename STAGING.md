# Local staging database

Local development now runs against an **isolated local Postgres** instead of
production. This removes the "no safety net" risk where local dev + migration
testing ran against the live Supabase prod DB.

## What's set up (on this machine)

- A local database **`leadkaun_dev`** in the running Homebrew `postgresql@14`
  server (reached over its `/tmp` Unix socket — peer auth, no password).
- Its schema is an **exact clone of production** (`pg_dump --schema-only` of the
  prod `public` schema), so it includes every table — including ones the repo's
  migration files don't (see caveat below).
- Seeded with the demo account/workspace/stages/sources/templates
  (`prisma/seed.ts`) plus a dev ADMIN (`prisma/bootstrap-dev-admin.ts`) so
  `DEV_AUTH_BYPASS=true` logs you in as `dev-admin@leadkaun.local`.

## Switching databases

```bash
bash scripts/use-db.sh staging   # local leadkaun_dev (default for dev)
bash scripts/use-db.sh prod      # the live Supabase prod DB — careful!
```

Two gitignored env files hold the full configs: `.env.local.staging` (local
socket DB) and `.env.local.prod` (**real prod credentials — never commit**).
`.env.local` is whichever is currently active.

## Rebuilding staging from scratch

```bash
/opt/homebrew/opt/postgresql@14/bin/dropdb --if-exists leadkaun_dev
/opt/homebrew/opt/postgresql@14/bin/createdb leadkaun_dev
# clone prod schema (needs prod creds in .env.local.prod):
set -a; . ./.env.local.prod; set +a
/opt/homebrew/opt/libpq/bin/pg_dump "$DIRECT_URL" --schema-only --schema=public --no-owner --no-privileges \
  | /opt/homebrew/opt/postgresql@14/bin/psql "host=/tmp dbname=leadkaun_dev"
# seed + admin (against staging):
bash scripts/use-db.sh staging
set -a; . ./.env.local; set +a
npx tsx prisma/seed.ts
npx tsx prisma/bootstrap-dev-admin.ts
```

To load test leads, use the in-app **Import Leads** page (it scores them through
the real pipeline) with the bundled `test-leads.csv`.

## Applying new migrations to staging

`prisma migrate deploy` resolves `localhost` to the *other* Postgres on TCP
`:5432`, so use the socket-based helper instead:

```bash
bash scripts/migrate-staging.sh   # applies any unapplied prisma/migrations/* over the socket
```

Workflow going forward: test a migration against **staging** first, then apply
to **prod** with a backup (`prisma migrate deploy` against `.env.local.prod`).

## Migration history (baselined 2026-06-28)

Previously the repo's migrations didn't reproduce prod — `workspaces`,
`workspace_members`, `rate_limits` had been `db push`'d with no migration files.
This was **fixed by squashing to a single complete baseline**:
`prisma/migrations/00000000000000_init/migration.sql` is generated from
`prisma/schema.prisma` (verified to exactly match live prod) and reproduces the
entire schema (19 tables, 17 enums, 55 indexes/FKs). It was proven on a scratch
DB (column-identical to prod) and marked applied on prod + staging
(`_prisma_migrations` has the single baseline row; `prisma migrate status` →
"up to date"). A fresh DB can now be built from migrations alone, so rebuilding
staging no longer needs the prod-schema clone — though the clone steps above
still work.
