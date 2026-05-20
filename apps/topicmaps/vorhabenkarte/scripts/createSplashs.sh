#!/usr/bin/env bash
set -euo pipefail

SRC="./public/splashscreens/base_blurred.jpg.png"
OUTDIR="./public/splashscreens"

mkdir -p "$OUTDIR"

# Resize + cover + center crop. Emits both PNG (for apple-touch-startup-image)
# and JPG (for the inline #splash-loading CSS background fallback).
mk () {
  local W="$1"; local H="$2"; local BASE="$3"
  magick "$SRC" \
    -resize "${W}x${H}^" \
    -gravity center -extent "${W}x${H}" \
    -strip -interlace Plane -quality 90 \
    "$OUTDIR/${BASE}.png"
  magick "$SRC" \
    -resize "${W}x${H}^" \
    -gravity center -extent "${W}x${H}" \
    -strip -interlace Plane -quality 85 \
    "$OUTDIR/${BASE}.jpg"
}

# ---- iPhone family ----
mk  640 1136 "iphone-320x568@2-portrait"
mk 1136  640 "iphone-320x568@2-landscape"

mk  750 1334 "iphone-375x667@2-portrait"
mk 1334  750 "iphone-375x667@2-landscape"

mk 1242 2208 "iphone-414x736@3-portrait"
mk 2208 1242 "iphone-414x736@3-landscape"

mk 1125 2436 "iphone-375x812@3-portrait"
mk 2436 1125 "iphone-375x812@3-landscape"

mk  828 1792 "iphone-414x896@2-portrait"
mk 1792  828 "iphone-414x896@2-landscape"

mk 1242 2688 "iphone-414x896@3-portrait"
mk 2688 1242 "iphone-414x896@3-landscape"

mk 1170 2532 "iphone-390x844@3-portrait"
mk 2532 1170 "iphone-390x844@3-landscape"

mk 1284 2778 "iphone-428x926@3-portrait"
mk 2778 1284 "iphone-428x926@3-landscape"

mk 1080 2340 "iphone-360x780@3-portrait"
mk 2340 1080 "iphone-360x780@3-landscape"

mk 1290 2796 "iphone-430x932@3-portrait"
mk 2796 1290 "iphone-430x932@3-landscape"

mk 1179 2556 "iphone-393x852@3-portrait"
mk 2556 1179 "iphone-393x852@3-landscape"

mk 1206 2622 "iphone-402x874@3-portrait"
mk 2622 1206 "iphone-402x874@3-landscape"

mk 1320 2868 "iphone-440x956@3-portrait"
mk 2868 1320 "iphone-440x956@3-landscape"

# ---- iPad family ----
mk 1536 2048 "ipad-768x1024@2-portrait"
mk 2048 1536 "ipad-768x1024@2-landscape"

mk 1668 2224 "ipad-834x1112@2-portrait"
mk 2224 1668 "ipad-834x1112@2-landscape"

mk 1668 2388 "ipad-834x1194@2-portrait"
mk 2388 1668 "ipad-834x1194@2-landscape"

mk 2048 2732 "ipad-1024x1366@2-portrait"
mk 2732 2048 "ipad-1024x1366@2-landscape"

echo "Done. Files in: $OUTDIR"
