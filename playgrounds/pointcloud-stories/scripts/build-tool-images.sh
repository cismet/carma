#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_command docker

docker build -t "${POINTCLOUD_UNTWINE_IMAGE:-local/untwine}" \
  -f "$SCRIPT_DIR/docker/untwine.Dockerfile" "$SCRIPT_DIR/docker"
docker build -t "${POINTCLOUD_PDAL_IMAGE:-local/pdal-py}" \
  -f "$SCRIPT_DIR/docker/pdal-python.Dockerfile" "$SCRIPT_DIR/docker"
