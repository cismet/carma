#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_command docker
require_command node
require_command realpath
require_command rg

PDAL_IMAGE="${POINTCLOUD_PDAL_IMAGE:-local/pdal-py}"
REPO_ROOT="$(cd -- "$PROJECT_ROOT/../.." && pwd)"
MESH_ERROR_TARGET="${POINTCLOUD_AO_MESH_ERROR_METERS:-0.5}"
VOXEL_SIZE="${POINTCLOUD_AO_VOXEL_METERS:-0.5}"
RAY_LENGTH="${POINTCLOUD_AO_RAY_LENGTH_METERS:-50}"
RAY_COUNT="${POINTCLOUD_AO_RAY_COUNT:-256}"
SELF_BIAS="${POINTCLOUD_AO_SELF_BIAS_METERS:-1}"
FOOTPRINT_CELL_SIZE="${POINTCLOUD_AO_FOOTPRINT_CELL_METERS:-25}"
KEEP_CACHE="${POINTCLOUD_AO_KEEP_CACHE:-false}"
GCG2016_TILE="$REPO_ROOT/libraries/commons/resources/src/lib/de/gcg2016/N50E006.ts"
ACTIVE_LOCK=""
cleanup_lock() {
  if [[ -n "$ACTIVE_LOCK" ]]; then
    rm -rf "$ACTIVE_LOCK"
  fi
}
trap cleanup_lock EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
[[ -s "$GCG2016_TILE" ]] || {
  printf 'Missing bundled GCG2016 tile: %s\n' "$GCG2016_TILE" >&2
  exit 1
}

FORCE=false
BAKE_ONLY=false
ASSET=all
while (( $# > 0 )); do
  case "$1" in
    --force)
      FORCE=true
      shift
      ;;
    --bake-only)
      BAKE_ONLY=true
      shift
      ;;
    --asset)
      ASSET="${2:-}"
      shift 2
      ;;
    *)
      printf 'Usage: %s [--force] [--bake-only] [--asset kwh|awg|oelbergMls|nordbahntrasseSegments]\n' "$0" >&2
      exit 2
      ;;
  esac
done
case "$ASSET" in
  all|kwh|awg|oelbergMls|nordbahntrasseSegments) ;;
  *)
    printf 'Unknown asset: %s\n' "$ASSET" >&2
    exit 2
    ;;
esac

source_for() {
  case "$1" in
    kwh)
      printf '%s\n' "${POINTCLOUD_KWH_SOURCE:-$SOURCE_INPUT_ROOT/kwh.copc.laz}"
      ;;
    awg)
      printf '%s\n' "${POINTCLOUD_AWG_SOURCE:-$SOURCE_INPUT_ROOT/awg.copc.laz}"
      ;;
    oelbergMls)
      if [[ -n "${POINTCLOUD_OELBERG_MLS_SOURCE:-}" ]]; then
        printf '%s\n' "$POINTCLOUD_OELBERG_MLS_SOURCE"
      elif [[ -s "$DERIVED_ROOT/pointcloud-sources/wuppertal-oelberg-mls-2025-09-11.copc.laz" ]]; then
        printf '%s\n' "$DERIVED_ROOT/pointcloud-sources/wuppertal-oelberg-mls-2025-09-11.copc.laz"
      else
        printf '%s\n' "$DERIVED_ROOT/wuppertal-oelberg-mls-2025-09-11.copc.laz"
      fi
      ;;
    nordbahntrasseSegments)
      if [[ -n "${POINTCLOUD_NORDBAHN_SOURCE:-}" ]]; then
        printf '%s\n' "$POINTCLOUD_NORDBAHN_SOURCE"
      elif [[ -s "$DERIVED_ROOT/pointcloud-sources/nordbahntrasse-2025-12-segments.copc.laz" ]]; then
        printf '%s\n' "$DERIVED_ROOT/pointcloud-sources/nordbahntrasse-2025-12-segments.copc.laz"
      else
        printf '%s\n' "$DERIVED_ROOT/nordbahntrasse-2025-12-segments.copc.laz"
      fi
      ;;
  esac
}

output_for() {
  case "$1" in
    kwh) printf '%s\n' 'kaiser-wilhelm-hain-rgb.copc.laz' ;;
    awg) printf '%s\n' 'awg-2-segmentierung.copc.laz' ;;
    oelbergMls) printf '%s\n' 'wuppertal-oelberg-mls-2025-09-11.copc.laz' ;;
    nordbahntrasseSegments) printf '%s\n' 'nordbahntrasse-2025-12-segments.copc.laz' ;;
  esac
}

process_asset() {
  local asset="$1"
  local source output_name ao_root inspection manifest triangles triangle_metadata
  local source_dir source_name enriched report work env_name pinned_source
  source="$(source_for "$asset")"
  output_name="$(output_for "$asset")"
  ao_root="$DERIVED_ROOT/pointcloud-ao/$asset-mesh2024-ge$MESH_ERROR_TARGET-r$RAY_LENGTH"
  inspection="$ao_root/inspection.json"
  manifest="$ao_root/manifest.json"
  triangles="$ao_root/triangles-utm32-relative.f32"
  triangle_metadata="$ao_root/triangles.json"
  enriched="$ao_root/$asset-ao-enriched.laz"
  report="$ao_root/ao-report.json"
  work="$ao_root/work"

  [[ -f "$source" ]] || {
    printf 'Missing immutable source for %s: %s\n' "$asset" "$source" >&2
    exit 1
  }
  source="$(realpath "$source")"
  if [[ -s "$DERIVED_ROOT/$output_name" && "$FORCE" != true ]] && \
     node "$SCRIPT_DIR/inventory/copc-field-stats.mjs" --max-nodes 1 \
       "$DERIVED_ROOT/$output_name" 2>/dev/null | rg -q '"name": "AO"'; then
    printf 'Keep existing Mesh-2024 AO COPC %s (pass --force to rebuild)\n' "$output_name"
    return
  fi
  if [[ "$source" == "$DERIVED_ROOT/$output_name" ]]; then
    pinned_source="$DERIVED_ROOT/pointcloud-sources/$output_name"
    if [[ ! -s "$pinned_source" ]]; then
      if node "$SCRIPT_DIR/inventory/copc-field-stats.mjs" --max-nodes 1 \
          "$source" 2>/dev/null | rg -q '"name": "AO"'; then
        printf 'Missing immutable source for %s; final COPC already contains AO\n' \
          "$asset" >&2
        exit 1
      fi
      mkdir -p "$(dirname -- "$pinned_source")"
      ln "$source" "$pinned_source"
    fi
    source="$(realpath "$pinned_source")"
  fi
  mkdir -p "$ao_root"
  local requested_lock="$ao_root/.build-lock"
  if ! mkdir "$requested_lock" 2>/dev/null; then
    printf 'Another AO build owns %s\n' "$requested_lock" >&2
    [[ -s "$requested_lock/owner" ]] && cat "$requested_lock/owner" >&2
    exit 1
  fi
  ACTIVE_LOCK="$requested_lock"
  printf 'pid=%s asset=%s started=%s\n' \
    "$$" "$asset" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$ACTIVE_LOCK/owner"
  mkdir -p "$work"
  source_dir="$(cd -- "$(dirname -- "$source")" && pwd)"
  source_name="$(basename -- "$source")"

  rm -f "$inspection.next"
  docker run --rm \
    --entrypoint python3 \
    -v "$REPO_ROOT:/workspace:ro" \
    -v "$source_dir:/input:ro" \
    -v "$ao_root:/ao" \
    -w /workspace/playgrounds/pointcloud-stories \
    "$PDAL_IMAGE" scripts/bake-pointcloud-ao.py inspect \
    --source "/input/$source_name" \
    --profile "$asset" \
    --gcg2016-tile /workspace/libraries/commons/resources/src/lib/de/gcg2016/N50E006.ts \
    --footprint-cell-size "$FOOTPRINT_CELL_SIZE" \
    --output /ao/inspection.json.next \
    > "$ao_root/inspection.log"
  mv -f "$inspection.next" "$inspection"

  if [[ ! -s "$triangles" || ! -s "$triangle_metadata" ]]; then
    node "$SCRIPT_DIR/prepare-mesh-ao-source.mjs" \
      --inspection "$inspection" \
      --output "$ao_root" \
      --error-target "$MESH_ERROR_TARGET" \
      --buffer "$RAY_LENGTH" \
      > "$ao_root/mesh-download.log"
    node "$SCRIPT_DIR/extract-mesh-ao-triangles.mjs" "$manifest" \
      > "$ao_root/mesh-extraction.log"
  fi

  rm -rf "$work"
  mkdir -p "$work"
  rm -f "$enriched.next" "$report.next"
  docker run --rm \
    --entrypoint python3 \
    -v "$REPO_ROOT:/workspace:ro" \
    -v "$source_dir:/input:ro" \
    -v "$ao_root:/ao" \
    -w /workspace/playgrounds/pointcloud-stories \
    "$PDAL_IMAGE" scripts/bake-pointcloud-ao.py bake \
    --source "/input/$source_name" \
    --profile "$asset" \
    --gcg2016-tile /workspace/libraries/commons/resources/src/lib/de/gcg2016/N50E006.ts \
    --inspection /ao/inspection.json \
    --triangles /ao/triangles-utm32-relative.f32 \
    --triangles-metadata /ao/triangles.json \
    --mesh-manifest /ao/manifest.json \
    --work-directory /ao/work \
    --output "/ao/$asset-ao-enriched.laz.next" \
    --output-label "$asset-ao-enriched.laz" \
    --report /ao/ao-report.json.next \
    --voxel-size "$VOXEL_SIZE" \
    --ray-length "$RAY_LENGTH" \
    --ray-count "$RAY_COUNT" \
    --self-bias "$SELF_BIAS" \
    > "$ao_root/ao-bake.log"
  mv -f "$enriched.next" "$enriched"
  mv -f "$report.next" "$report"

  if [[ "$BAKE_ONLY" == true ]]; then
    rm -rf "$work" "$ACTIVE_LOCK"
    ACTIVE_LOCK=""
    printf 'Mesh-2024 AO master ready: %s\n' "$enriched"
    return
  fi

  case "$asset" in
    kwh) env_name=POINTCLOUD_KWH_AO_SOURCE ;;
    awg) env_name=POINTCLOUD_AWG_AO_SOURCE ;;
    oelbergMls) env_name=POINTCLOUD_OELBERG_MLS_AO_SOURCE ;;
    nordbahntrasseSegments) env_name=POINTCLOUD_NORDBAHN_AO_SOURCE ;;
  esac
  env "$env_name=$enriched" \
    "$SCRIPT_DIR/preprocess-pointclouds.sh" --force --asset "$asset"
  node "$SCRIPT_DIR/finalize-pointcloud-ao-report.mjs" \
    "$report" "$DERIVED_ROOT/$output_name" "$report.next"
  mv -f "$report.next" "$report"
  cp -f "$report" "$REPORT_ROOT/$output_name.ao-report.json"

  rm -rf "$work"
  rm -f "$enriched"
  if [[ "$KEEP_CACHE" != true ]]; then
    find "$ao_root" -maxdepth 1 -type f \( -name '*.b3dm' -o -name '*.glb' \) -delete
    rm -f "$triangles"
  fi
  rm -rf "$ACTIVE_LOCK"
  ACTIVE_LOCK=""
  printf 'Mesh-2024 AO COPC ready: %s\n' "$DERIVED_ROOT/$output_name"
}

for candidate in kwh awg nordbahntrasseSegments oelbergMls; do
  if [[ "$ASSET" == all || "$ASSET" == "$candidate" ]]; then
    process_asset "$candidate"
  fi
done

publication_ready=true
for file in \
  kaiser-wilhelm-hain-rgb.copc.laz \
  awg-2-segmentierung.copc.laz \
  wuppertal-oelberg-mls-2025-09-11.copc.laz \
  nordbahntrasse-2025-12-segments.copc.laz; do
  if [[ ! -s "$DERIVED_ROOT/$file" || \
        ! -s "$REPORT_ROOT/$file.ao-report.json" ]]; then
    publication_ready=false
  fi
done
if [[ "$publication_ready" == true ]]; then
  node "$SCRIPT_DIR/create-pointcloud-publication-manifest.mjs" \
    "$DERIVED_ROOT" "$REPORT_ROOT" \
    "$DERIVED_ROOT/pointcloud-mesh2024-ao-v1.manifest.json"
fi

printf 'All requested point-cloud AO builds completed.\n'
