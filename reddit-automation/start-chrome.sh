#!/bin/bash

echo "🧹 Killing existing Chrome instances..."
pkill -f "chrome --remote-debugging-port" || true
pkill -f chromium || true
sleep 2

echo "🚀 Starting Chrome with remote debugging..."

nohup google-chrome-stable \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug \
  > /tmp/chrome-debug.log 2>&1 &

sleep 3

echo "✅ Chrome started (background)"
