#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_command docker
PDAL_IMAGE="${POINTCLOUD_PDAL_IMAGE:-local/pdal-py}"
OUTPUT="$REPORT_ROOT/elevation-results.jsonl"

docker run --rm \
  --entrypoint python3 \
  -v "$DERIVED_ROOT:/data:ro" \
  -v "$SCRIPT_DIR/verify/verify-elevation.py:/work/verify-elevation.py:ro" \
  "$PDAL_IMAGE" /work/verify-elevation.py --data-root /data | tee "$OUTPUT"

printf 'Elevation verification written to %s\n' "$OUTPUT"
