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
#   NEON_DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require" \
#     ./scripts/sync-local-db.sh
#
# Env:
#   NEON_DATABASE_URL  (required) Neon connection string. Use the DIRECT host;
#                      this script strips "-pooler" for you if present.

set -euo pipefail

: "${NEON_DATABASE_URL:?Set NEON_DATABASE_URL to the Neon connection string}"

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
