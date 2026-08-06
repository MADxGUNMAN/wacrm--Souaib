#!/bin/bash
# ============================================================
# wacrm scheduled task pinger.
#
# Deployed to /opt/wacrm/cron-ping.sh on the app server and invoked by
# cron every 5 minutes (see deploy/crontab).
#
# It hits two endpoints, both authenticated with AUTOMATION_CRON_SECRET:
#   /api/automations/cron — resumes automation `wait` steps whose timer
#                           has elapsed. Without it, any automation
#                           containing a delay stalls forever.
#   /api/flows/cron       — marks abandoned `active` flow runs as
#                           timed_out. Without it, each abandoned run
#                           keeps occupying the partial unique index
#                           `idx_one_active_run_per_contact`, which
#                           silently blocks every future flow trigger
#                           for that contact.
#
# ─── Why this is a script and not an inline crontab command ───
# The original crontab inlined the curl and wrapped the secret lookup in
# SINGLE QUOTES:
#
#   curl -sf -H 'x-cron-secret: $(cat /opt/wacrm/.env | grep ...)' ...
#
# Single quotes stop the shell expanding `$(...)`, so curl sent the
# literal 66-character string "$(cat /opt/wacrm/.env | grep ...)" as the
# secret. The endpoints compare length first, so a 66-char value could
# never match the 64-char secret and every request returned 401 — from
# the day it was installed. Nobody noticed because `curl -sf` suppresses
# HTTP error output and `> /dev/null 2>&1` discarded the rest.
#
# Keeping the command in a file avoids crontab quoting altogether (cron
# also treats `%` as a special character, a second trap), and the log
# below means the next failure is visible rather than silent.
#
# Verify after any change:
#   /opt/wacrm/cron-ping.sh && tail /opt/wacrm/cron.log
# You want http=200. http=401 means the secret is not reaching the app.
# ============================================================
set -uo pipefail

ENV_FILE=/opt/wacrm/.env
LOG_FILE=/opt/wacrm/cron.log
BASE_URL=http://localhost:3000

# `cut -d= -f2-` (not -f2) so a secret containing '=' survives intact.
# `tr -d '\r\n'` strips the CR a Windows-edited .env would leave behind,
# which would otherwise make the header one byte too long and 401.
SECRET="$(grep -m1 '^AUTOMATION_CRON_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r\n')"

if [ -z "$SECRET" ]; then
  echo "$(date -Is) FATAL no AUTOMATION_CRON_SECRET found in $ENV_FILE" >> "$LOG_FILE"
  exit 1
fi

for ep in automations flows; do
  # Capture body and status together so the log records what the app
  # actually said, not just that something happened.
  out=$(curl -s --max-time 60 -w '\n%{http_code}' \
    -H "x-cron-secret: $SECRET" "$BASE_URL/api/$ep/cron")
  code=$(printf '%s' "$out" | tail -n1)
  body=$(printf '%s' "$out" | sed '$d' | tr -d '\n')
  echo "$(date -Is) $ep http=$code $body" >> "$LOG_FILE"
done

# Bound the log so it can never fill the disk. ~2000 lines is about a
# week at a 5-minute interval; trim back to the most recent 1000.
if [ "$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)" -gt 2000 ]; then
  tail -n 1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi
