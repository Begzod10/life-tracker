#!/bin/bash
cd /var/www/life_tracker
git fetch origin master
git reset --hard origin/master
cd /var/www/life_tracker/backend
/var/www/life_tracker/backend/venv/bin/pip install -r requirements.txt

cd /var/www/life_tracker/frontend
npm run build
systemctl restart life_tracker.service
systemctl restart life_tracker_frontend.service
echo "Deployed at $(date)"
