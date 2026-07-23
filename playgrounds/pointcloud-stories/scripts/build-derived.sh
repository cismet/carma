#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_command docker

"$SCRIPT_DIR/preprocess-pointclouds.sh" --asset oelbergMls
"$SCRIPT_DIR/preprocess-pointclouds.sh" --asset nordbahntrasseSegments
"$SCRIPT_DIR/build-pointcloud-aos.sh"

if [[ -n "${GEORADAR_SOURCE_ROOT:-}" && \
      ( ! -f "$DERIVED_ROOT/georadar-volume/capture-026-10m.json" || \
      ! -f "$DERIVED_ROOT/georadar-volume/capture-026-10m-noise-gated.r16" || \
      ! -f "$DERIVED_ROOT/georadar-volume/capture-026-10m-noise-gated.u10" ) ]]; then
  "$SCRIPT_DIR/build-georadar-volume.sh"
fi

if [[ -n "${GEORADAR_SOURCE_ROOT:-}" && \
      ! -f "$DERIVED_ROOT/georadar-volume/capture-026-5x10m.json" ]]; then
  "$SCRIPT_DIR/build-georadar-volume-strip.sh"
fi

printf 'Derived browser assets ready under %s\n' "$DERIVED_ROOT"
