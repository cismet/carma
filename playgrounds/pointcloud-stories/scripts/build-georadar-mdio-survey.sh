#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_command uv

SOURCE_ROOT="$DERIVED_ROOT/georadar-survey"
OUTPUT_ROOT="$DERIVED_ROOT/georadar-mdio"
mkdir -p "$OUTPUT_ROOT"

for ((capture_id = 1; capture_id <= 27; capture_id += 1)); do
  printf -v token '%03d' "$capture_id"
  source_metadata="$SOURCE_ROOT/capture-$token.json"
  output_store="$OUTPUT_ROOT/capture-$token.mdio"
  if [[ ! -f "$source_metadata" ]]; then
    printf 'Missing Georadar survey source: %s\n' "$source_metadata" >&2
    exit 1
  fi
  if [[ -d "$output_store" && "${GEORADAR_MDIO_FORCE:-0}" != "1" ]]; then
    printf 'capture %s: MDIO store already exists\n' "$token"
    continue
  fi
  arguments=(
    "$source_metadata"
    "$output_store"
    --chunk-slices "${GEORADAR_MDIO_CHUNK_SLICES:-128}"
  )
  if [[ "${GEORADAR_MDIO_FORCE:-0}" == "1" ]]; then
    arguments+=(--force)
  fi
  printf 'capture %s: building MDIO\n' "$token"
  uv run --script "$SCRIPT_DIR/derive-georadar-mdio.py" "${arguments[@]}"
done
