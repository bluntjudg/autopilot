#!/bin/bash

echo "Starting Reddit Automation Stack"

# Start reddit automation browser
google-chrome \
--remote-debugging-port=9222 \
--user-data-dir=$HOME/chrome-cdp \
https://reddit.com &

sleep 5

gnome-terminal -- bash -c "
cd ~/projects/autopilot/reddit-automation
node autopilot.js
exec bash
"


echo "Starting Knowledge Automation Stack"

# Start knowledge automation browser
google-chrome \
--remote-debugging-port=9224 \
--user-data-dir=$HOME/chrome-cdp-seo \
https://reddit.com &

sleep 5

gnome-terminal -- bash -c "
cd ~/projects/autopilot/knowledge-automation
node autopilot.js
exec bash
"

echo "All automations started"
