#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_command node
require_command magick

SCENE_ROOT="$DERIVED_ROOT/capture-026-scene"
PANORAMA_MIRROR_ROOT="$MIRROR_ROOT/panorama"

"$SCRIPT_DIR/derive-capture-026-image-textures.mjs" \
  --scene-root "$SCENE_ROOT" \
  --panorama-mirror-root "$PANORAMA_MIRROR_ROOT" \
  --download-helper "$SCRIPT_DIR/catalog/download-url.mjs" \
  --magick-command "$(command -v magick)" \
  --preview-max-dimension 512

printf 'Capture 026 image textures ready: %s/image-textures.json\n' "$SCENE_ROOT"
