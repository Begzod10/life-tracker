#!/bin/bash
cd /var/www/life_tracker
git fetch origin master
git reset --hard origin/master
cd /var/www/life_tracker/frontend
npm run build
systemctl restart life_tracker.service
systemctl restart life_tracker_frontend.service
echo "Deployed at $(date)"
