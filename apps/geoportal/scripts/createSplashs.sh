#!/usr/bin/env bash
set -euo pipefail

SRC="./public/splashscreens/base_blurred.jpg.png"
OUTDIR="./public/splashscreens"

mkdir -p "$OUTDIR"

# Helper: resize + cover + center (no letterboxing)
# Uses ^ to cover, then extent to crop to exact WxH.
mk () {
  local W="$1"; local H="$2"; local NAME="$3"
  magick "$SRC" \
    -resize "${W}x${H}^" \
    -gravity center -extent "${W}x${H}" \
    -strip -interlace Plane -quality 90 \
    "$OUTDIR/$NAME"
}

# ---- iPhone family ----
# iPhone 5 / SE (1st gen) — 320x568 @2 => 640x1136
mk  640 1136 "iphone-320x568@2-portrait.png"
mk 1136  640 "iphone-320x568@2-landscape.png"

# iPhone 6/7/8/SE2/SE3 — 375x667 @2 => 750x1334
mk  750 1334 "iphone-375x667@2-portrait.png"
mk 1334  750 "iphone-375x667@2-landscape.png"

# iPhone Plus — 414x736 @3 => 1242x2208
mk 1242 2208 "iphone-414x736@3-portrait.png"
mk 2208 1242 "iphone-414x736@3-landscape.png"

# iPhone X/XS/11 Pro — 375x812 @3 => 1125x2436
mk 1125 2436 "iphone-375x812@3-portrait.png"
mk 2436 1125 "iphone-375x812@3-landscape.png"

# iPhone XR / 11 — 414x896 @2 => 828x1792
mk  828 1792 "iphone-414x896@2-portrait.png"
mk 1792  828 "iphone-414x896@2-landscape.png"

# iPhone XS Max / 11 Pro Max — 414x896 @3 => 1242x2688
mk 1242 2688 "iphone-414x896@3-portrait.png"
mk 2688 1242 "iphone-414x896@3-landscape.png"

# iPhone 12/13/14/15 — 390x844 @3 => 1170x2532
mk 1170 2532 "iphone-390x844@3-portrait.png"
mk 2532 1170 "iphone-390x844@3-landscape.png"

# iPhone 12/13/14/15 Pro Max — 428x926 @3 => 1284x2778
mk 1284 2778 "iphone-428x926@3-portrait.png"
mk 2778 1284 "iphone-428x926@3-landscape.png"

# iPhone 13 mini — 360x780 @3 => 1080x2340
mk 1080 2340 "iphone-360x780@3-portrait.png"
mk 2340 1080 "iphone-360x780@3-landscape.png"

# iPhone 14/15/16 Plus — 430x932 @3 => 1290x2796
mk 1290 2796 "iphone-430x932@3-portrait.png"
mk 2796 1290 "iphone-430x932@3-landscape.png"

# ---- iPad family ----
# iPad (Mini/Air/9.7) — 768x1024 @2 => 1536x2048
mk 1536 2048 "ipad-768x1024@2-portrait.png"
mk 2048 1536 "ipad-768x1024@2-landscape.png"

# iPad Pro 10.5" — 834x1112 @2 => 1668x2224
mk 1668 2224 "ipad-834x1112@2-portrait.png"
mk 2224 1668 "ipad-834x1112@2-landscape.png"

# iPad Pro 11" — 834x1194 @2 => 1668x2388
mk 1668 2388 "ipad-834x1194@2-portrait.png"
mk 2388 1668 "ipad-834x1194@2-landscape.png"

# iPad Pro 12.9" — 1024x1366 @2 => 2048x2732
mk 2048 2732 "ipad-1024x1366@2-portrait.png"
mk 2732 2048 "ipad-1024x1366@2-landscape.png"

echo "Done. Files in: $OUTDIR"