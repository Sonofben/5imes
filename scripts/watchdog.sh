#!/usr/bin/env bash
# 5ime watchdog — run every minute by the systemd timer in deploy/systemd/.
#
# Docker restarts the app if it crashes (restart: unless-stopped), but NOT if it is still
# running and has stopped answering (hung, out of memory, stuck worker). This fills that gap:
#
#   - app does not answer /api/health 3 checks in a row  → restart the container
#   - container missing or stopped                         → start it
#   - Nginx not running                                    → test the config, then start it
#   - disk over 90% full or under 200 MB memory free      → warning in the log
#
# A 503 from /api/health means the app is up but Supabase is not answering. Restarting the
# app would not fix that, so it is logged and left alone.
#
# Everything goes to the system journal:   journalctl -t 5ime-watchdog --since today
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/apps/5ime}"
CONTAINER="fivetime-web"
HEALTH="http://127.0.0.1:3005/api/health"
STATE="/run/5ime-watchdog.failures"
FAILS_BEFORE_RESTART=3

say() { logger -t 5ime-watchdog -- "$*"; echo "$*"; }

# Do not interfere while scripts/deploy.sh is releasing (it holds this lock).
exec 9>/run/5ime-deploy.lock
if ! flock -n 9; then exit 0; fi

# 1. Nginx — the public front door.
if ! systemctl is-active --quiet nginx; then
  if nginx -t -q 2>/dev/null; then
    systemctl start nginx && say "Nginx was not running; started it."
  else
    say "Nginx is not running and its configuration has an error (run: nginx -t). Not starting it."
  fi
fi

# 2. The app container.
state="$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo missing)"
if [ "$state" != "running" ]; then
  say "Container ${CONTAINER} is ${state}; starting it."
  (cd "$APP_DIR" && docker compose up -d --no-build) >/dev/null 2>&1 || say "Could not start ${CONTAINER}."
  echo 0 > "$STATE"
  exit 0
fi

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH" || true)"
fails="$(cat "$STATE" 2>/dev/null || echo 0)"
case "$code" in
  200)
    [ "$fails" != "0" ] && say "App answering again (after ${fails} failed checks)."
    echo 0 > "$STATE" ;;
  503)
    say "App is up but the database (Supabase) is not answering. Not restarting the app."
    echo 0 > "$STATE" ;;
  *)
    fails=$((fails + 1)); echo "$fails" > "$STATE"
    say "App did not answer the health check (HTTP ${code:-none}); failure ${fails} of ${FAILS_BEFORE_RESTART}."
    if [ "$fails" -ge "$FAILS_BEFORE_RESTART" ]; then
      say "Restarting ${CONTAINER}. Last log lines follow."
      docker logs "$CONTAINER" --tail 20 2>&1 | logger -t 5ime-watchdog
      docker restart "$CONTAINER" >/dev/null && say "Restarted ${CONTAINER}."
      echo 0 > "$STATE"
    fi ;;
esac

# 3. Early warnings for the usual causes of slow death on a shared VPS.
disk="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
[ "${disk:-0}" -ge 90 ] && say "Warning: disk is ${disk}% full. Free space with: docker system prune -f (and old logs)."
mem="$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)"
[ "${mem:-1000}" -lt 200 ] && say "Warning: only ${mem} MB memory available on the server."
exit 0
