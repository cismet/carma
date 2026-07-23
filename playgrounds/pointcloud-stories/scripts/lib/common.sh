#!/usr/bin/env bash
set -euo pipefail

COMMON_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$COMMON_DIR/../.." && pwd)"
ENV_FILE="${POINTCLOUD_ENV_FILE:-$PROJECT_ROOT/.env.local}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

resolve_from_project() {
  local value="$1"
  if [[ "$value" = /* ]]; then
    printf '%s\n' "$value"
  else
    printf '%s\n' "$PROJECT_ROOT/$value"
  fi
}

DATA_ROOT="$(resolve_from_project "${POINTCLOUD_DATA_ROOT:-.data}")"
MIRROR_ROOT="$DATA_ROOT/mirror"
SOURCE_INPUT_ROOT="$DATA_ROOT/source-inputs"
DERIVED_ROOT="$DATA_ROOT/derived"
REPORT_ROOT="$DATA_ROOT/reports"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  }
}

require_config() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing %s in %s\n' "$name" "$ENV_FILE" >&2
    exit 1
  fi
}

mkdir -p "$MIRROR_ROOT" "$SOURCE_INPUT_ROOT" "$DERIVED_ROOT" "$REPORT_ROOT"
