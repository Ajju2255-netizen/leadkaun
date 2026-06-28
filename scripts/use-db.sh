#!/usr/bin/env bash
# Switch the active .env.local between the LOCAL STAGING database and PRODUCTION.
#
#   bash scripts/use-db.sh staging   # local PG14 leadkaun_dev (safe, isolated)
#   bash scripts/use-db.sh prod      # the live Supabase prod DB (be careful!)
#
# Both full env files live next to .env.local and are gitignored:
#   .env.local.staging  — local socket DB URLs, everything else copied from prod
#   .env.local.prod     — the real production credentials (NEVER commit)
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  staging) cp .env.local.staging .env.local; echo "→ .env.local now uses LOCAL STAGING (leadkaun_dev)" ;;
  prod)    cp .env.local.prod    .env.local; echo "→ .env.local now uses PRODUCTION — mutations hit live data!" ;;
  *) echo "usage: bash scripts/use-db.sh staging|prod"; exit 1 ;;
esac

# Show the active DB host (without leaking any credentials).
grep -E "^DATABASE_URL" .env.local | sed -E 's#(://)[^@]*@#\1#'
