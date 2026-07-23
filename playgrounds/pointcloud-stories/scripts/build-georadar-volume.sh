#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_command docker

CAPTURE_ID="${GEORADAR_VOLUME_CAPTURE_ID:-26}"
START_METER="${GEORADAR_VOLUME_START_METER:-0}"
LENGTH_METER="${GEORADAR_VOLUME_LENGTH_METER:-10}"
PDAL_IMAGE="${POINTCLOUD_PDAL_IMAGE:-local/pdal-py}"
SOURCE_ROOT="$(resolve_from_project "${GEORADAR_SOURCE_ROOT:-$SOURCE_INPUT_ROOT/georadar}")"
CAPTURE_TOKEN="$(printf '%03d' "$CAPTURE_ID")"
VOLUME_FILE="${GEORADAR_VOLUME_SOURCE:-$(find "$SOURCE_ROOT" -type f -name "*-${CAPTURE_TOKEN}_vol.laz" -print -quit)}"
T0_FILE="${GEORADAR_SURFACE_SOURCE:-$(find "$SOURCE_ROOT" -type f -name "*-${CAPTURE_TOKEN} - Region1-0.laz" -print -quit)}"
OUTPUT_ROOT="$DERIVED_ROOT/georadar-volume"
OUTPUT_PREFIX="capture-$(printf '%03d' "$CAPTURE_ID")-10m"

[[ -f "$VOLUME_FILE" ]] || {
  printf 'Missing Georadar volume source: %s\n' "$VOLUME_FILE" >&2
  exit 1
}
[[ -f "$T0_FILE" ]] || {
  printf 'Missing Georadar T0 source: %s\n' "$T0_FILE" >&2
  exit 1
}

mkdir -p "$OUTPUT_ROOT"
VOLUME_DIR="$(dirname -- "$VOLUME_FILE")"
VOLUME_NAME="$(basename -- "$VOLUME_FILE")"
T0_DIR="$(dirname -- "$T0_FILE")"
T0_NAME="$(basename -- "$T0_FILE")"
docker run --rm \
  -e PROJ_LIB=/opt/conda/share/proj \
  -e PROJ_DATA=/opt/conda/share/proj \
  -v "$VOLUME_DIR:/volume:ro" \
  -v "$T0_DIR:/surface:ro" \
  -v "$SCRIPT_DIR:/scripts:ro" \
  -v "$OUTPUT_ROOT:/out" \
  "$PDAL_IMAGE" \
  /scripts/derive-georadar-volume.py \
  "/volume/$VOLUME_NAME" \
  "/surface/$T0_NAME" \
  "/out/$OUTPUT_PREFIX" \
  --capture-id "$CAPTURE_ID" \
  --start-meter "$START_METER" \
  --length-meter "$LENGTH_METER"

printf 'Georadar volume ready: %s/%s.json\n' "$OUTPUT_ROOT" "$OUTPUT_PREFIX"
