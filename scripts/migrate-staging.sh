#!/usr/bin/env bash
# Apply Prisma migrations to the LOCAL staging Postgres over its Unix socket.
#
# Why not `prisma migrate deploy`? This machine runs two Postgres servers — the
# local PG14 (which owns the /tmp socket and holds leadkaun_dev) and a separate
# server on TCP :5432 with password auth. Prisma's migration engine resolves
# `localhost` to the TCP server (auth fails), so we apply the migration SQL
# directly over the socket and record each in _prisma_migrations ourselves.
# The app itself connects fine via the socket URL in .env.local.
#
# Usage: bash scripts/migrate-staging.sh
set -euo pipefail

PSQL=/opt/homebrew/opt/postgresql@14/bin/psql
CONN="host=/tmp dbname=leadkaun_dev"
MIG_DIR="$(cd "$(dirname "$0")/../prisma/migrations" && pwd)"

# Prisma's bookkeeping table (matches `prisma migrate`'s own DDL).
$PSQL "$CONN" -v ON_ERROR_STOP=1 -q -c '
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" varchar(36) PRIMARY KEY,
    "checksum" varchar(64) NOT NULL,
    "finished_at" timestamptz,
    "migration_name" varchar(255) NOT NULL,
    "logs" text,
    "rolled_back_at" timestamptz,
    "started_at" timestamptz NOT NULL DEFAULT now(),
    "applied_steps_count" integer NOT NULL DEFAULT 0
  );'

applied=0
for dir in "$MIG_DIR"/*/; do
  name="$(basename "$dir")"
  [ -f "$dir/migration.sql" ] || continue
  exists=$($PSQL "$CONN" -tAc "select count(*) from \"_prisma_migrations\" where migration_name='$name';")
  if [ "$exists" != "0" ]; then
    echo "• $name — already applied"
    continue
  fi
  echo "→ applying $name"
  $PSQL "$CONN" -v ON_ERROR_STOP=1 -q -f "$dir/migration.sql"
  checksum=$(shasum -a 256 "$dir/migration.sql" | awk '{print $1}')
  uuid=$(uuidgen | tr 'A-Z' 'a-z')
  $PSQL "$CONN" -v ON_ERROR_STOP=1 -q -c \
    "insert into \"_prisma_migrations\"(id,checksum,migration_name,started_at,finished_at,applied_steps_count) \
     values('$uuid','$checksum','$name',now(),now(),1);"
  applied=$((applied+1))
done

echo "Done. Newly applied: $applied"
