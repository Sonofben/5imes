#!/usr/bin/env bash
# 5ime release on the VPS. Run from /opt/apps/5ime:   scripts/deploy.sh [git-ref]
#
#   1. fetch the code (default: origin/main, or a tag such as v2026.10.18)
#   2. apply pending database migrations (scripts/migrate.sh) — stops here if one fails
#   3. keep the running image as fivetime-web:previous, build the new one, start it
#   4. wait for /api/health; if it doesn't come up healthy, put the previous image back
#
# Database migrations are forward-only and written so the previous app version still works
# with the new schema, so rolling back the app never needs a database rollback.
set -euo pipefail
cd "$(dirname "$0")/.."

ref="${1:-origin/main}"
health="http://127.0.0.1:3005/api/health"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "1/4 Fetching ${ref}"
git fetch --tags origin
before="$(git rev-parse --short HEAD)"
git checkout --quiet --detach "$ref"
now="$(git rev-parse --short HEAD)"
version="$(git describe --tags --always)"
echo "was ${before}, now ${now} (${version})"

say "2/4 Database migrations"
scripts/migrate.sh

say "3/4 Building and starting ${version}"
if docker image inspect fivetime-web:latest >/dev/null 2>&1; then
  docker tag fivetime-web:latest fivetime-web:previous
fi
APP_VERSION="$version" docker compose build
APP_VERSION="$version" docker compose up -d

say "4/4 Health check"
for i in $(seq 1 30); do
  if body="$(curl -fsS --max-time 5 "$health" 2>/dev/null)"; then
    echo "healthy: ${body}"
    say "Released ${version}. To undo: scripts/deploy.sh ${before}"
    exit 0
  fi
  sleep 3
done

echo "Not healthy after 90 seconds. Last log lines:" >&2
docker logs fivetime-web --tail 40 >&2 || true
if docker image inspect fivetime-web:previous >/dev/null 2>&1; then
  say "Rolling back the app to the previous image"
  docker tag fivetime-web:previous fivetime-web:latest
  docker compose up -d --no-build
  git checkout --quiet --detach "$before"
  echo "Rolled back to ${before}. The database migrations stay applied (they are backward compatible)." >&2
fi
exit 1
