#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_command docker
require_command node

PDAL_IMAGE="${POINTCLOUD_PDAL_IMAGE:-local/pdal-py}"
UNTWINE_IMAGE="${POINTCLOUD_UNTWINE_IMAGE:-local/untwine}"
SOURCE_DHHN2016_UTM32_SRS="EPSG:25832+7837"
OELBERG_RAW_ROOT="${POINTCLOUD_OELBERG_RAW_ROOT:-$SOURCE_INPUT_ROOT/oelberg-mls}"
NORDBAHN_RAW_ROOT="${POINTCLOUD_NORDBAHN_RAW_ROOT:-$SOURCE_INPUT_ROOT/nordbahntrasse}"
FORCE=false
ASSET=all
ACTIVE_LOCK=""
ACTIVE_SCRATCH_VOLUME=""
ACTIVE_SPLIT_DIRECTORY=""
cleanup_lock() {
  if [[ -n "$ACTIVE_LOCK" ]]; then
    rm -rf "$ACTIVE_LOCK"
  fi
}
cleanup_scratch_volume() {
  if [[ -n "$ACTIVE_SCRATCH_VOLUME" ]]; then
    docker volume rm -f "$ACTIVE_SCRATCH_VOLUME" >/dev/null 2>&1 || true
    ACTIVE_SCRATCH_VOLUME=""
  fi
}
cleanup_split_directory() {
  if [[ -n "$ACTIVE_SPLIT_DIRECTORY" ]]; then
    rm -rf "$ACTIVE_SPLIT_DIRECTORY"
    ACTIVE_SPLIT_DIRECTORY=""
  fi
}
cleanup() {
  cleanup_scratch_volume
  cleanup_split_directory
  cleanup_lock
}
acquire_lock() {
  local requested_lock="$DERIVED_ROOT/.$1.build-lock"
  if ! mkdir "$requested_lock" 2>/dev/null; then
    printf 'Another point-cloud build owns %s\n' "$requested_lock" >&2
    [[ -s "$requested_lock/owner" ]] && cat "$requested_lock/owner" >&2
    exit 1
  fi
  ACTIVE_LOCK="$requested_lock"
  printf 'pid=%s output=%s started=%s\n' \
    "$$" "$1" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$ACTIVE_LOCK/owner"
}
release_lock() {
  cleanup_lock
  ACTIVE_LOCK=""
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
while (( $# > 0 )); do
  case "$1" in
    --force)
      FORCE=true
      shift
      ;;
    --asset)
      ASSET="${2:-}"
      shift 2
      ;;
    *)
      printf 'Usage: %s [--force] [--asset kwh|awg|oelbergMls|nordbahntrasseSegments]\n' "$0" >&2
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

replace_output() {
  local next="$1"
  local output="$2"
  [[ -s "$next" ]] || {
    printf 'Preprocessor produced no output: %s\n' "$next" >&2
    exit 1
  }
  mv -f "$next" "$output"
}

normalize_copc() {
  local source="$1"
  local output_name="$2"
  local assigned_srs="$3"
  local extra_dims="${4:-}"
  local output="$DERIVED_ROOT/$output_name"
  local next="$DERIVED_ROOT/.$output_name.next"

  [[ -f "$source" ]] || {
    printf 'Missing source: %s\n' "$source" >&2
    exit 1
  }
  if [[ -s "$output" && "$FORCE" != true ]]; then
    printf 'Keep existing %s (pass --force to rebuild)\n' "$output_name"
    return
  fi
  acquire_lock "$output_name"

  rm -f "$next"
  local source_dir source_name
  source_dir="$(dirname -- "$source")"
  source_name="$(basename -- "$source")"
  local writer_options=(
    --writers.copc.forward=header,scale,offset
    --writers.copc.a_srs="$assigned_srs"
    --writers.copc.pipeline=true
  )
  if [[ -n "$extra_dims" ]]; then
    writer_options+=(--writers.copc.extra_dims="$extra_dims")
  fi
  docker run --rm \
    -e PROJ_LIB=/opt/conda/share/proj \
    -e PROJ_DATA=/opt/conda/share/proj \
    --entrypoint pdal \
    -v "$source_dir:/input:ro" \
    -v "$DERIVED_ROOT:/output" \
    "$PDAL_IMAGE" translate \
    "/input/$source_name" "/output/.$output_name.next" \
    --reader readers.las --writer writers.copc \
    "${writer_options[@]}"
  replace_output "$next" "$output"
  release_lock
}

run_untwine_sources() {
  local input_root="$1"
  local pattern="$2"
  local output_name="$3"
  local dimensions="$4"
  local assigned_srs="$5"
  local next="$DERIVED_ROOT/.$output_name.next"
  local scratch_volume="carma-pointcloud-untwine-${output_name//[^a-zA-Z0-9_.-]/-}"

  [[ -d "$input_root" ]] || {
    printf 'Missing source directory: %s\n' "$input_root" >&2
    exit 1
  }
  rm -f "$next"
  docker volume rm -f "$scratch_volume" >/dev/null 2>&1 || true
  docker volume create \
    --label carma.pointcloud.scratch=true \
    --label "carma.pointcloud.output=$output_name" \
    "$scratch_volume" >/dev/null
  ACTIVE_SCRATCH_VOLUME="$scratch_volume"
  docker run --rm \
    -e PROJ_LIB=/opt/conda/share/proj \
    -e PROJ_DATA=/opt/conda/share/proj \
    -e UNTWINE_PYRAMID_THREADS="${POINTCLOUD_UNTWINE_PYRAMID_THREADS:-4}" \
    -e FILE_PATTERN="$pattern" \
    -e OUTPUT_NAME=".$output_name.next" \
    -e DIMENSIONS="$dimensions" \
    -e ASSIGNED_SRS="$assigned_srs" \
    --entrypoint /bin/bash \
    -v "$input_root:/input:ro" \
    -v "$DERIVED_ROOT:/output" \
    -v "$scratch_volume:/scratch" \
    "$UNTWINE_IMAGE" -c '
      set -euo pipefail
      args=()
      while IFS= read -r -d "" file; do args+=(-i "$file"); done \
        < <(find /input -type f -name "$FILE_PATTERN" -print0)
      (( ${#args[@]} > 0 )) || { echo "No matching LAS sources" >&2; exit 1; }
      dimension_args=()
      if [[ -n "$DIMENSIONS" ]]; then
        dimension_args+=(--dims "$DIMENSIONS")
      fi
      srs_args=()
      if [[ -n "$ASSIGNED_SRS" ]]; then
        srs_args+=(--a_srs "$ASSIGNED_SRS")
      fi
      untwine "${args[@]}" "${dimension_args[@]}" "${srs_args[@]}" \
        --output_dir "/output/$OUTPUT_NAME" \
        --temp_dir "/scratch/$OUTPUT_NAME"
    '
  cleanup_scratch_volume
}

untwine_sources() {
  local input_root="$1"
  local pattern="$2"
  local output_name="$3"
  local dimensions="$4"
  local assigned_srs="$5"
  local output="$DERIVED_ROOT/$output_name"
  local next="$DERIVED_ROOT/.$output_name.next"

  if [[ -s "$output" && "$FORCE" != true ]]; then
    printf 'Keep existing %s (pass --force to rebuild)\n' "$output_name"
    return
  fi
  acquire_lock "$output_name"
  run_untwine_sources \
    "$input_root" "$pattern" "$output_name" "$dimensions" "$assigned_srs"
  replace_output "$next" "$output"
  release_lock
}

untwine_large_laz() {
  local source="$1"
  local output_name="$2"
  local assigned_srs="$3"
  local output="$DERIVED_ROOT/$output_name"
  local next="$DERIVED_ROOT/.$output_name.next"
  local split_directory="$DERIVED_ROOT/.untwine-input-$output_name"
  local source_dir source_name

  [[ -f "$source" ]] || {
    printf 'Missing source: %s\n' "$source" >&2
    exit 1
  }
  if [[ -s "$output" && "$FORCE" != true ]]; then
    printf 'Keep existing %s (pass --force to rebuild)\n' "$output_name"
    return
  fi
  acquire_lock "$output_name"
  rm -rf "$split_directory"
  ACTIVE_SPLIT_DIRECTORY="$split_directory"
  source_dir="$(dirname -- "$source")"
  source_name="$(basename -- "$source")"
  docker run --rm \
    --entrypoint python3 \
    -v "$PROJECT_ROOT:/workspace:ro" \
    -v "$source_dir:/input:ro" \
    -v "$DERIVED_ROOT:/output" \
    -w /workspace \
    "$PDAL_IMAGE" scripts/split-laz-for-untwine.py \
    "/input/$source_name" "/output/.untwine-input-$output_name"

  # Untwine 1.5.1 can skip neighbouring fields while filtering dimensions.
  # The AO baker already pruned unused dimensions, so preserve its schema whole.
  run_untwine_sources \
    "$split_directory" 'part-*.laz' "$output_name" "" "$assigned_srs"
  replace_output "$next" "$output"
  cleanup_split_directory
  release_lock
}

KWH_SOURCE="${POINTCLOUD_KWH_AO_SOURCE:-${POINTCLOUD_KWH_SOURCE:-$SOURCE_INPUT_ROOT/kwh.copc.laz}}"
AWG_SOURCE="${POINTCLOUD_AWG_AO_SOURCE:-${POINTCLOUD_AWG_SOURCE:-$SOURCE_INPUT_ROOT/awg.copc.laz}}"

if [[ "$ASSET" == all || "$ASSET" == kwh ]]; then
  normalize_copc "$KWH_SOURCE" "kaiser-wilhelm-hain-rgb.copc.laz" \
    "$SOURCE_DHHN2016_UTM32_SRS" "${POINTCLOUD_KWH_AO_SOURCE:+AO=uint8}"
fi

if [[ "$ASSET" == all || "$ASSET" == awg ]]; then
  if [[ -n "${POINTCLOUD_AWG_AO_SOURCE:-}" ]]; then
    normalize_copc "$AWG_SOURCE" "awg-2-segmentierung.copc.laz" \
      "EPSG:25832" "AO=uint8"
  elif [[ -s "$DERIVED_ROOT/awg-2-segmentierung.copc.laz" && "$FORCE" != true ]]; then
    printf 'Keep existing awg-2-segmentierung.copc.laz (use build-pointcloud-aos.sh to rebuild)\n'
  else
    printf 'AWG preprocessing requires baked AO. Run %s/build-pointcloud-aos.sh.\n' "$SCRIPT_DIR" >&2
    exit 1
  fi
fi

if [[ "$ASSET" == all || "$ASSET" == oelbergMls ]]; then
  if [[ -n "${POINTCLOUD_OELBERG_MLS_AO_SOURCE:-}" ]]; then
    # The AO bake evaluates occlusion in the registered ellipsoidal frame but
    # preserves source XYZ in its output. Keep the source compound CRS here;
    # the viewer applies the same documented registration when mounting it.
    untwine_large_laz "$POINTCLOUD_OELBERG_MLS_AO_SOURCE" \
      "wuppertal-oelberg-mls-2025-09-11.copc.laz" \
      "$SOURCE_DHHN2016_UTM32_SRS"
  else
    untwine_sources "$OELBERG_RAW_ROOT" '*.las' \
      "wuppertal-oelberg-mls-2025-09-11.copc.laz" \
      "Intensity,Red,Green,Blue" "EPSG:25832+7837"
  fi
fi

if [[ "$ASSET" == all || "$ASSET" == nordbahntrasseSegments ]]; then
  if [[ -n "${POINTCLOUD_NORDBAHN_AO_SOURCE:-}" ]]; then
    normalize_copc "$POINTCLOUD_NORDBAHN_AO_SOURCE" \
      "nordbahntrasse-2025-12-segments.copc.laz" \
      "EPSG:25832" "AO=uint8"
  else
    untwine_sources "$NORDBAHN_RAW_ROOT" '*.las' \
      "nordbahntrasse-2025-12-segments.copc.laz" \
      "Intensity,Classification,UserData" "EPSG:25832"
  fi
fi

for file in \
  kaiser-wilhelm-hain-rgb.copc.laz \
  awg-2-segmentierung.copc.laz \
  wuppertal-oelberg-mls-2025-09-11.copc.laz \
  nordbahntrasse-2025-12-segments.copc.laz; do
  [[ -s "$DERIVED_ROOT/$file" ]] || continue
  node "$SCRIPT_DIR/inventory/copc-field-stats.mjs" --max-nodes 64 \
    "$DERIVED_ROOT/$file" > "$REPORT_ROOT/$file.field-stats.json"
done

printf 'Four browser COPCs and field reports are ready under %s\n' "$DERIVED_ROOT"
