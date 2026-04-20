#!/usr/bin/env bash
set -e

export PATH="/root/.meteor:$PATH"
export METEOR_ALLOW_SUPERUSER=1

if [ ! -f "package.json" ]; then
  echo "ERROR: No package.json found in /app."
  exit 1
fi

echo "Installing Meteor npm dependencies..."
meteor npm install

echo "Starting Meteor..."
exec meteor --port 3000 --exclude-archs web.browser.legacy,web.cordova
