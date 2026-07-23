#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_command node
require_command unzip
require_config CAPTURE_026_T0_SOURCE
require_config CAPTURE_026_PLANAR2_REFERENCE
require_config CAPTURE_026_PLANAR2_ARCHIVE
require_config CAPTURE_026_PLANAR3_REFERENCE
require_config CAPTURE_026_PLANAR3_ARCHIVE
require_config VITE_PANORAMA_BASE_URL

T0_SOURCE="$(resolve_from_project "$CAPTURE_026_T0_SOURCE")"
PLANAR2_REFERENCE="$(resolve_from_project "$CAPTURE_026_PLANAR2_REFERENCE")"
PLANAR2_ARCHIVE="$(resolve_from_project "$CAPTURE_026_PLANAR2_ARCHIVE")"
PLANAR3_REFERENCE="$(resolve_from_project "$CAPTURE_026_PLANAR3_REFERENCE")"
PLANAR3_ARCHIVE="$(resolve_from_project "$CAPTURE_026_PLANAR3_ARCHIVE")"
VOLUME_ROOT="$DERIVED_ROOT/georadar-volume"
OUTPUT_ROOT="$DERIVED_ROOT/capture-026-scene"
VOLUME_METADATA_NAME="${CAPTURE_026_VOLUME_METADATA_NAME:-capture-026-5x10m.json}"
SCENE_MANIFEST_NAME="${CAPTURE_026_SCENE_MANIFEST_NAME:-capture-026-scene.json}"

"$SCRIPT_DIR/derive-capture-026-scene.mjs" \
  --capture-id 26 \
  --t0 "$T0_SOURCE" \
  --volume-metadata "$VOLUME_ROOT/$VOLUME_METADATA_NAME" \
  --planar2-reference "$PLANAR2_REFERENCE" \
  --planar2-zip "$PLANAR2_ARCHIVE" \
  --planar3-reference "$PLANAR3_REFERENCE" \
  --planar3-zip "$PLANAR3_ARCHIVE" \
  --panorama-base-url "$VITE_PANORAMA_BASE_URL" \
  --output-name "$SCENE_MANIFEST_NAME" \
  --output-root "$OUTPUT_ROOT"

printf 'Capture 026 scene assets ready: %s/%s\n' "$OUTPUT_ROOT" "$SCENE_MANIFEST_NAME"
