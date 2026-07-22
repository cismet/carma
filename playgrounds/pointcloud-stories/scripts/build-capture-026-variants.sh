#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

for adjacent_segments in 2 5 10 13; do
  total_segments=$((adjacent_segments * 2 + 1))
  volume_name="capture-026-${total_segments}x10m.json"
  if [[ ! -f "$DERIVED_ROOT/georadar-volume/$volume_name" ]]; then
    GEORADAR_ADJACENT_SEGMENTS="$adjacent_segments" \
      "$SCRIPT_DIR/build-georadar-volume-strip.sh"
  fi

  if [[ "$total_segments" -eq 5 ]]; then
    manifest_name="capture-026-scene.json"
  else
    manifest_name="capture-026-scene-${total_segments}x10m.json"
  fi
  if [[ ! -f "$DERIVED_ROOT/capture-026-scene/$manifest_name" ]]; then
    CAPTURE_026_VOLUME_METADATA_NAME="$volume_name" \
      CAPTURE_026_SCENE_MANIFEST_NAME="$manifest_name" \
      "$SCRIPT_DIR/build-capture-026-scene.sh"
  fi
done

"$SCRIPT_DIR/build-capture-026-image-textures.sh"

printf 'Capture 026 strip variants ready under %s\n' "$DERIVED_ROOT"
