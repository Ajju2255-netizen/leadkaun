# Staging databases

> **Local** dev DB is below. **Cloud staging** (Vercel previews) runbook is at
> the bottom: [Cloud staging](#cloud-staging-vercel-previews--supabase).

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

---

# Cloud staging (Vercel previews → Supabase)

Goal: **preview deployments hit a separate Supabase _staging_ project**, never
production. Why a whole project (not just a DB): `DEV_AUTH_BYPASS` is off on
Vercel (previews run `NODE_ENV=production`), so previews need real Supabase
**auth** — and a session authed against prod but reading a staging DB is broken
(the user row won't exist). So staging = its own DB **and** auth.

## 1. Create the Supabase staging project
supabase.com → **New project** (free tier is fine), ideally the same region as
prod (`ap-southeast-2`). Set + save a DB password.

## 2. Collect connection details
- **Settings → Database → Connection string**
  - `DATABASE_URL` = the **Transaction pooler** string (port `6543`), password filled in.
  - `DIRECT_URL`   = the **Direct connection** string (port `5432`).
- **Settings → API**
  - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `anon` public key
  - `SUPABASE_SERVICE_ROLE_KEY` = `service_role` secret key

## 3. Apply the schema to staging (from a local checkout on `main`)
```bash
cd ~/Documents/GitHub/Leadkaun-Main/leadkaun
DIRECT_URL="<staging DIRECT_URL>" DATABASE_URL="<staging DIRECT_URL>" npx prisma migrate deploy
DIRECT_URL="<staging DIRECT_URL>" DATABASE_URL="<staging DIRECT_URL>" npx prisma migrate status   # → "up to date"
```
The single baseline migration builds the full schema in one shot. (Seeding is
optional — the app provisions pipeline stages/sources on signup. If you want it:
`DATABASE_URL="<staging DIRECT_URL>" npx tsx prisma/seed.ts`.)

## 4. Set Vercel **Preview** env vars
Vercel → **leadkaun → Settings → Environment Variables**. Add each scoped to
**Preview only** (uncheck Production/Development) — or `vercel env add <NAME> preview`:

| Var | Value |
|-----|-------|
| `DATABASE_URL` | staging transaction-pooler URL (`6543`) |
| `DIRECT_URL` | staging direct URL (`5432`) |
| `NEXT_PUBLIC_SUPABASE_URL` | staging Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | staging service_role key |

Leave every **other** var (`ENCRYPTION_KEY`, `NEXTAUTH_SECRET`, `INNGEST_*`,
`RESEND_*`, `NEXT_PUBLIC_APP_URL`) as-is — they're shared and fine for staging.
(If any are scoped Production-only, also add them for Preview.) Do **not** set
`DEV_AUTH_BYPASS` for Preview.

## 5. Configure staging Supabase Auth
Staging Supabase → **Authentication → URL Configuration**:
- **Redirect URLs**: add `https://*.vercel.app/**` (covers preview aliases).
- **Site URL**: a preview alias, e.g. `https://leadkaun-git-<branch>-<scope>.vercel.app`.
- For easy testing: **Auth → Providers → Email** → turn **off** "Confirm email"
  so signups log in immediately (staging only).

## 6. Deploy a preview & verify isolation
- Push a branch / open a PR → Vercel builds a Preview using the staging env.
- Open the preview → **/register** → create a test admin. This creates a Supabase
  auth user **in staging** + the account/user/workspace in the **staging DB**.
- Verify: you see your fresh staging account (not prod's), and prod
  (`app.leadkaun.com`) is untouched.

## Gotchas
- Use the **DIRECT_URL (5432)** for `prisma migrate deploy`, not the pooler.
- URL-encode special chars in the DB password inside the connection string.
- Background jobs/emails on preview use the **shared** Inngest/Resend keys — fine
  for staging; create staging keys + scope them to Preview if you want isolation.
