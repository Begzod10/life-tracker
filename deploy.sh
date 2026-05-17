#!/bin/bash
set -e

cd /var/www/life_tracker
git fetch origin master
git reset --hard origin/master

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
