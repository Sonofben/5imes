#!/usr/bin/env bash
# Run every migration and every SQL test on a THROWAWAY Postgres 16 — never on Supabase.
# Uses the standard PG* variables (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
# Without them, it starts a temporary Docker container and removes it afterwards.
#   scripts/test-db.sh            run the tests
#   scripts/test-db.sh --types    also regenerate src/lib/database.types.ts
set -euo pipefail
cd "$(dirname "$0")/.."
container=""
if [[ -z "${PGHOST:-}" ]]; then
  container="5ime-testdb-$$"
  docker run -d --rm --name "$container" -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:55432:5432 postgres:16-alpine >/dev/null
  trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
  export PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres
  for _ in $(seq 1 30); do pg_isready -q 2>/dev/null && break || sleep 1; done
fi
cd supabase
args="-f tests/00_supabase_stub.sql"
for f in migrations/*.sql tests/[1-9]*.sql; do args="$args -f $f"; done
log="$(mktemp)"
if ! psql -X -q -v ON_ERROR_STOP=1 $args >"$log" 2>&1; then
  tail -20 "$log" >&2
  echo "Database tests FAILED." >&2
  exit 1
fi
grep -E "^✅" "$log" || true
cd ..
if [[ "${1:-}" == "--types" ]]; then node scripts/gen-db-types.mjs; fi
echo "Database tests passed."
