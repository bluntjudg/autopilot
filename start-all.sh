#!/bin/bash

echo "Starting Reddit Automation Stack"

# Start reddit automation browser
chromium \
--remote-debugging-port=9222 \
--user-data-dir=$HOME/chrome-cdp \
https://reddit.com &

sleep 5

# Start reddit automation
cd ~/autopilot-main/reddit-automation
node autopilot.js &


echo "Starting Knowledge Automation Stack"

# Start knowledge automation browser
chromium \
--remote-debugging-port=9224 \
--user-data-dir=$HOME/chrome-cdp-seo \
https://reddit.com &

sleep 5

# Start knowledge automation
cd ~/autopilot-main/knowledge-automation
node autopilot.js &


echo "All automations started successfully"
