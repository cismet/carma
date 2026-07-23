#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_command node

CAPTURE_ID="${GEORADAR_VOLUME_CAPTURE_ID:-26}"
SEGMENT_LENGTH_METER="${GEORADAR_SEGMENT_LENGTH_METER:-10}"
ADJACENT_SEGMENTS="${GEORADAR_ADJACENT_SEGMENTS:-2}"
START_METER="${GEORADAR_STRIP_START_METER:-0}"
SOURCE_ROOT="$(resolve_from_project "${GEORADAR_SOURCE_ROOT:-$SOURCE_INPUT_ROOT/georadar}")"
CAPTURE_TOKEN="$(printf '%03d' "$CAPTURE_ID")"
VOLUME_FILE="${GEORADAR_VOLUME_SOURCE:-$(find "$SOURCE_ROOT" -type f -name "*-${CAPTURE_TOKEN}_vol.laz" -print -quit)}"
T0_FILE="${GEORADAR_SURFACE_SOURCE:-$(find "$SOURCE_ROOT" -type f -name "*-${CAPTURE_TOKEN} - Region1-0.laz" -print -quit)}"
TOTAL_SEGMENTS=$((ADJACENT_SEGMENTS * 2 + 1))
OUTPUT_STEM="${GEORADAR_VOLUME_OUTPUT_STEM:-capture-$(printf '%03d' "$CAPTURE_ID")-${TOTAL_SEGMENTS}x${SEGMENT_LENGTH_METER}m}"
OUTPUT_PREFIX="$DERIVED_ROOT/georadar-volume/$OUTPUT_STEM"

[[ -f "$VOLUME_FILE" ]] || {
  printf 'Missing Georadar volume source: %s\n' "$VOLUME_FILE" >&2
  exit 1
}
[[ -f "$T0_FILE" ]] || {
  printf 'Missing Georadar T0 source: %s\n' "$T0_FILE" >&2
  exit 1
}

node "$SCRIPT_DIR/derive-georadar-volume-strip.mjs" \
  --volume "$VOLUME_FILE" \
  --surface "$T0_FILE" \
  --output-prefix "$OUTPUT_PREFIX" \
  --capture-id "$CAPTURE_ID" \
  --start-meter "$START_METER" \
  --segment-length-meter "$SEGMENT_LENGTH_METER" \
  --adjacent-segments "$ADJACENT_SEGMENTS"

printf 'Georadar strip ready: %s.json\n' "$OUTPUT_PREFIX"
