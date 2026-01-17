#!/bin/bash
# Generates PWA icons from Icon-App-rect.png

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$SCRIPT_DIR/Icon-App-rect.png"
PUBLIC="$SCRIPT_DIR/public"

if [ ! -f "$SOURCE" ]; then
  echo "Error: Icon-App-rect.png not found"
  exit 1
fi

echo "Generating icons from Icon-App-rect.png..."

sips -z 512 512 "$SOURCE" --out "$PUBLIC/Icon-App-512.png"
sips -z 144 144 "$SOURCE" --out "$PUBLIC/Icon-App-144.png"
sips -z 180 180 "$SOURCE" --out "$PUBLIC/apple-touch-icon-180.png"
sips -z 167 167 "$SOURCE" --out "$PUBLIC/apple-touch-icon-167.png"
sips -z 152 152 "$SOURCE" --out "$PUBLIC/apple-touch-icon-152.png"
sips -z 120 120 "$SOURCE" --out "$PUBLIC/apple-touch-icon-120.png"
# Note: favicon.ico is managed manually, not generated from Icon-App-rect.png

echo "Done!"
