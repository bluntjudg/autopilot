#!/bin/bash

echo "🚀 Starting Reddit Automation Autopilot"

# ----------------------------
# Move to script directory
# ----------------------------
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1

# ----------------------------
# Check Node.js
# ----------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is not installed"
  echo "👉 Install Node.js (>=18) and retry"
  exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node detected: $NODE_VERSION"

# ----------------------------
# Install dependencies (if needed)
# ----------------------------
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies"
  npm install || exit 1
else
  echo "📦 Dependencies already installed"
fi

# ----------------------------
# Start Chrome in CDP mode
# ----------------------------
if ! curl -s http://localhost:9222/json/version >/dev/null; then
  echo "🌐 Starting Chrome in CDP mode"

  google-chrome \
    --remote-debugging-port=9222 \
    --user-data-dir="$HOME/chrome-cdp" \
    --no-first-run \
    --no-default-browser-check \
    https://www.reddit.com &

  sleep 6
else
  echo "🌐 Chrome CDP already running"
fi

# ----------------------------
# Ensure data files exist
# ----------------------------
mkdir -p data

[ ! -f data/to_comment.json ] && echo "[]" > data/to_comment.json
[ ! -f data/commented_posts.json ] && echo "[]" > data/commented_posts.json
[ ! -f data/last_search.json ] && echo "{}" > data/last_search.json

# ----------------------------
# Start Autopilot
# ----------------------------
echo "🤖 Launching Autopilot (24×7)"
node autopilot.js


# make it executable: chmod +x run.sh
# run it: ./run.sh