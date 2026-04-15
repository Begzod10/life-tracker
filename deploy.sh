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
npm install
npm run build

# Restart services
systemctl restart life_tracker.service
systemctl restart life_tracker_celery.service
systemctl restart life_tracker_celerybeat.service
systemctl restart life_tracker_frontend.service

echo "Deployed at $(date)"
