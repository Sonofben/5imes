#!/usr/bin/env bash
# 5ime database migrations — applies every supabase/migrations/NNNN_name.sql that has not run yet,
# in order, and records each one so it never runs twice.
#
# Records go in supabase_migrations.schema_migrations — the same table the Supabase CLI uses,
# so `supabase migration list` shows the same history if you ever switch to the CLI.
#
# Needs DATABASE_URL (Supabase → Connect → "Session pooler" connection string, with your
# database password). Put it in .env; it is read from there. Never commit it.
# Uses psql from a throwaway postgres container, so nothing needs installing on the server.
#
#   scripts/migrate.sh --status          list applied and pending migrations
#   scripts/migrate.sh                   apply pending migrations
#   scripts/migrate.sh --baseline 0013   ONE TIME ONLY: record 0001…0013 as already applied
#                                        (for a database where they were run by hand)
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set. Add it to .env (Supabase → Connect → Session pooler)." >&2
  exit 2
fi

if command -v psql >/dev/null 2>&1; then LOCAL_PSQL=1; else LOCAL_PSQL=0; fi
# Path of a migration file as the psql that runs it sees it.
migration_path() { if [[ $LOCAL_PSQL == 1 ]]; then echo "$1"; else echo "/supabase/migrations/$(basename "$1")"; fi; }

psql_run() {
  if [[ $LOCAL_PSQL == 1 ]]; then
    PGOPTIONS="-c client_min_messages=warning" psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"
  else
    docker run --rm -i --network host -e PGOPTIONS="-c client_min_messages=warning" -v "$PWD/supabase:/supabase:ro" -w / postgres:16-alpine \
      psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"
  fi
}

psql_run <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
SQL

applied() { psql_run -At -c "select version from supabase_migrations.schema_migrations order by version"; }

mode="${1:-apply}"
mapfile -t files < <(ls supabase/migrations/[0-9]*_*.sql | sort)
mapfile -t done_versions < <(applied)
is_done() { local v="$1"; for d in "${done_versions[@]:-}"; do [[ "$d" == "$v" ]] && return 0; done; return 1; }

case "$mode" in
  --status)
    for f in "${files[@]}"; do
      b="$(basename "$f" .sql)"; v="${b%%_*}"
      if is_done "$v"; then echo "applied  $b"; else echo "PENDING  $b"; fi
    done
    ;;
  --baseline)
    upto="${2:?usage: --baseline NNNN}"
    for f in "${files[@]}"; do
      b="$(basename "$f" .sql)"; v="${b%%_*}"
      [[ "$v" > "$upto" ]] && break
      is_done "$v" || psql_run -c "insert into supabase_migrations.schema_migrations (version, name) values ('$v', '${b#*_}') on conflict do nothing"
      echo "recorded $b"
    done
    ;;
  apply)
    pending=0
    for f in "${files[@]}"; do
      b="$(basename "$f" .sql)"; v="${b%%_*}"
      is_done "$v" && continue
      pending=1
      echo "applying $b …"
      # Each migration file has its own begin/commit, so a failure leaves nothing half-done.
      psql_run -f "$(migration_path "$f")"
      psql_run -c "insert into supabase_migrations.schema_migrations (version, name) values ('$v', '${b#*_}')"
      echo "applied  $b"
    done
    if [[ $pending == 0 ]]; then echo "Database is up to date."; fi
    ;;
  *) echo "usage: scripts/migrate.sh [--status | --baseline NNNN]" >&2; exit 2 ;;
esac
