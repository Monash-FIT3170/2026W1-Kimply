#!/usr/bin/env bash
set -e

export PATH="/root/.meteor:$PATH"
export METEOR_ALLOW_SUPERUSER=1

if [ ! -f "package.json" ]; then
  echo "ERROR: No package.json found in /app."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing Meteor npm dependencies..."
  meteor npm install
fi

echo "Starting Meteor..."
exec meteor --port 3000 --exclude-archs web.browser.legacy,web.cordova
