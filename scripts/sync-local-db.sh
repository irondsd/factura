#!/usr/bin/env bash
#
# Sync the local Docker Postgres from the Neon (production) database.
#
# Dumps Neon and restores it into the local container, then nulls out the R2
# storage references — the local `factura-dev` bucket doesn't contain the prod
# objects, so pointing the app at them would render dead "View PDF" links. With
# storage_key cleared, migrated bills show "not stored" and re-uploads land in
# factura-dev with fresh keys. See src/server/storage.ts / bill-drawer/parts.tsx.
#
# Runs pg_dump / psql *inside* the `db` container, so no host Postgres client is
# needed — only Docker and a running db (`docker compose up -d db`).
#
# Usage:
#   ./scripts/sync-local-db.sh                    # reads DATABASE_URL from .env.prod
#   ./scripts/sync-local-db.sh path/to/other.env  # or from another env file
#
# Env:
#   NEON_DATABASE_URL  (optional) Neon connection string; overrides the env file.
#   PROD_ENV_FILE      (optional) env file to read DATABASE_URL from.
#                      Default: .env.prod at the repo root.
# Either way the DIRECT host is used; this script strips "-pooler" for you.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-${PROD_ENV_FILE:-$REPO_ROOT/.env.prod}}"

# Read a key from a dotenv file without sourcing it — values here are unquoted
# and contain `?`/`&`, which the shell would happily mangle.
read_env() {
  local key="$1" file="$2" line
  line="$(grep -m1 -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" || true)"
  [[ -n "$line" ]] || return 1
  line="${line#*=}"
  # strip one layer of surrounding quotes, if present
  [[ "$line" == \"*\" || "$line" == \'*\' ]] && line="${line:1:${#line}-2}"
  printf '%s' "$line"
}

if [[ -z "${NEON_DATABASE_URL:-}" ]]; then
  [[ -f "$ENV_FILE" ]] || {
    echo "✗ No env file at $ENV_FILE — pass one as \$1, or set NEON_DATABASE_URL." >&2
    exit 1
  }
  NEON_DATABASE_URL="$(read_env DATABASE_URL "$ENV_FILE")" || {
    echo "✗ No DATABASE_URL found in $ENV_FILE." >&2
    exit 1
  }
  echo "▸ Using DATABASE_URL from ${ENV_FILE/#$REPO_ROOT\//}"
fi

: "${NEON_DATABASE_URL:?DATABASE_URL is empty}"

# The pooler (PgBouncer, transaction mode) can choke on pg_dump; use the direct endpoint.
SOURCE_URL="${NEON_DATABASE_URL/-pooler/}"
# Target is the container's own Postgres, addressed from inside the container.
LOCAL_URL="postgresql://factura:factura@localhost:5432/factura"

DB_EXEC=(docker compose exec -T db)

echo "▸ Resetting local schema…"
"${DB_EXEC[@]}" psql "$LOCAL_URL" -v ON_ERROR_STOP=1 -q \
  -c "DROP SCHEMA IF EXISTS public CASCADE;" \
  -c "CREATE SCHEMA public;"

echo "▸ Dumping Neon → local…"
"${DB_EXEC[@]}" pg_dump --no-owner --no-acl --no-comments "$SOURCE_URL" \
  | "${DB_EXEC[@]}" psql "$LOCAL_URL" -v ON_ERROR_STOP=1 -q

echo "▸ Clearing R2 storage references (prod objects aren't in factura-dev)…"
"${DB_EXEC[@]}" psql "$LOCAL_URL" -v ON_ERROR_STOP=1 -q \
  -c "UPDATE bills SET storage_key = NULL WHERE storage_key IS NOT NULL;"

echo "✓ Local DB synced from Neon."
