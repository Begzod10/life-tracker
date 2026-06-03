#!/bin/bash
set -euo pipefail

REPO=/var/www/life_tracker
LOCK=/var/run/life_tracker_deploy.lock

# Prevent overlapping cron runs. A heavy deploy (npm ci + npm run build) can
# take longer than the 5-minute cron interval; without this lock two ticks
# would race git reset --hard and clobber each other's build.
exec 9>"$LOCK"
flock -n 9 || { echo "$(date -Iseconds) deploy: already running, skipping"; exit 0; }

cd "$REPO"

# Compare local HEAD to origin/master BEFORE touching the working tree, so a
# no-op tick produces zero log lines (avoids ~1.7k lines/day of git chatter).
before=$(git rev-parse HEAD)
git fetch --quiet origin master
after=$(git rev-parse origin/master)

if [ "$before" = "$after" ]; then
  exit 0
fi

echo "$(date -Iseconds) deploy: $before -> $after"

# On failure, leave the broken sha checked out but do NOT restart services.
# The site keeps serving on the previously-running code; the log shows which
# sha broke. Pushing a fix triggers a fresh deploy on the next tick.
on_failure() {
  echo "$(date -Iseconds) deploy: FAILED at $after (line $1) — services NOT restarted"
}
trap 'on_failure $LINENO' ERR

git reset --hard --quiet "$after"

# Decide what to do based on what actually changed between before and after.
changed=$(git diff --name-only "$before" "$after")
backend_changed=false
frontend_changed=false
requirements_changed=false
lockfile_changed=false
if echo "$changed" | grep -q '^backend/';                    then backend_changed=true; fi
if echo "$changed" | grep -q '^frontend/';                   then frontend_changed=true; fi
if echo "$changed" | grep -q '^backend/requirements\.txt$';  then requirements_changed=true; fi
if echo "$changed" | grep -q '^frontend/package-lock\.json$'; then lockfile_changed=true; fi

# ---- Backend ----
if $backend_changed; then
  cd "$REPO/backend"
  if $requirements_changed; then
    echo "  requirements.txt changed -> pip install"
    venv/bin/pip install --quiet -r requirements.txt
  fi
  echo "  alembic upgrade head"
  venv/bin/alembic upgrade head
fi

# ---- Frontend ----
if $frontend_changed; then
  cd "$REPO/frontend"

  # Clear stale Next.js build lock from a previously killed `next build`.
  pkill -f "next build" 2>/dev/null || true
  rm -f .next/lock

  if $lockfile_changed || [ ! -d node_modules ]; then
    echo "  package-lock changed -> npm ci"
    npm ci --silent
  fi
  echo "  npm run build"
  npm run build
fi

# ---- Restart only the services whose code changed ----
# Frontend-only pushes no longer SIGTERM celery, so in-flight tasks
# (e.g. the 22:30 AI daily-conclusion) survive a frontend deploy.
if $backend_changed; then
  echo "  restart backend + celery"
  systemctl restart life_tracker.service
  systemctl restart life_tracker_celery.service
  systemctl restart life_tracker_celerybeat.service
fi
if $frontend_changed; then
  echo "  restart frontend"
  systemctl restart life_tracker_frontend.service
fi

echo "$(date -Iseconds) deploy: OK"
