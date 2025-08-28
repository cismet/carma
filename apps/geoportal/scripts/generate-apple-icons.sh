#!/usr/bin/env bash
set -euo pipefail

SRC="./public/Icon-App-rect.png"
OUTDIR="./public/"
BGCOLOR="#000000"   # 👈 change this to your desired background color

mkdir -p "$OUTDIR"

mk () {
  local SIZE="$1"; local NAME="$2"
  magick "$SRC" \
    -resize "${SIZE}x${SIZE}^" \
    -gravity center \
    -background "$BGCOLOR" -extent "${SIZE}x${SIZE}" \
    -strip -quality 92 \
    "$OUTDIR/$NAME"
}

mk 180 "apple-touch-icon-180.png"
mk 167 "apple-touch-icon-167.png"
mk 152 "apple-touch-icon-152.png"
mk 120 "apple-touch-icon-120.png"

echo "Done. Icons in $OUTDIR/ with background $BGCOLOR"