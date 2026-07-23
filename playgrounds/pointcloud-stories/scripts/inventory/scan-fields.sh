#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

require_command docker
require_command python3

if (( $# > 0 )); then
  FILES=("$@")
else
  FILES=()
  while IFS= read -r file; do
    FILES+=("$file")
  done < <(find "$DERIVED_ROOT" -maxdepth 1 -type f \
    \( -name '*.laz' -o -name '*.las' \) -print | sort)
fi

for file in "${FILES[@]}"; do
  [[ -f "$file" ]] || continue
  directory="$(dirname -- "$file")"
  name="$(basename -- "$file")"
  count="$({
    docker run --rm -v "$directory:/data:ro" pdal/pdal:latest \
      pdal info --metadata "/data/$name" 2>/dev/null
  } | python3 -c '
import json
import sys
print(json.load(sys.stdin)["metadata"].get("count", 0))
' 2>/dev/null || true)"

  if [[ -z "$count" || "$count" == "0" ]]; then
    printf '%s | unreadable\n' "$name"
    continue
  fi

  midpoint=$((count / 2))
  {
    for start in 0 "$midpoint"; do
      docker run --rm -v "$directory:/data:ro" pdal/pdal:latest \
        pdal info --point "$start-$((start + 299))" "/data/$name" \
        2>/dev/null | python3 -c '
import json
import sys

try:
    payload = json.load(sys.stdin)
except Exception:
    raise SystemExit()
points = payload.get("points", {}).get("point", [])
if isinstance(points, dict):
    points = [points]
for point in points:
    if isinstance(point, dict):
        print(json.dumps(point))
'
    done
  } | FILE_NAME="$name" python3 -c '
import collections
import json
import os
import sys

nonzero = collections.Counter()
total = 0
for line in sys.stdin:
    if not line.strip():
        continue
    point = json.loads(line)
    total += 1
    for key, value in point.items():
        if isinstance(value, (int, float)) and value != 0:
            nonzero[key] += 1
filled = sorted(key for key, count in nonzero.items() if count > total * 0.01)
print(f"{os.environ[\"FILE_NAME\"]} | sampled {total} | filled: {\",\".join(filled)}")
'
done
