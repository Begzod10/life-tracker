#!/bin/bash
set -e

cd /var/www/life_tracker

# Skip the whole deploy when there are no new commits — otherwise the cron
# (*/5) restarts celery every 5 minutes and SIGTERMs any in-flight task
# (e.g. the 22:30 AI daily-conclusion).
before=$(git rev-parse HEAD)
git fetch origin master
git reset --hard origin/master
after=$(git rev-parse HEAD)

if [ "$before" = "$after" ]; then
  exit 0
fi

echo "Deploying $before -> $after at $(date)"

# Backend
cd /var/www/life_tracker/backend
/var/www/life_tracker/backend/venv/bin/pip install -r requirements.txt
/var/www/life_tracker/backend/venv/bin/alembic upgrade head

# Build frontend
cd /var/www/life_tracker/frontend

# Clear any stale build lock from a previously killed `next build`.
# Next.js leaves .next/lock around if SIGTERM/OOM kills the process,
# which blocks the next build with "Unable to acquire lock".
pkill -f "next build" 2>/dev/null || true
rm -f .next/lock

npm install
npm run build

# Restart services
systemctl restart life_tracker.service
systemctl restart life_tracker_celery.service
systemctl restart life_tracker_celerybeat.service
systemctl restart life_tracker_frontend.service

echo "Deployed at $(date)"
