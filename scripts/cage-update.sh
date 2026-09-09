#!/bin/bash
#
# Move the cage submodule to the released main and stage the pointer.
#
# The staging is the point. `.gitmodules` sets `ignore = all` for this
# submodule, so a moved pointer never shows up in `git status` and the `git add`
# is the step that gets forgotten.
#
# Usage: npm run cage:update

set -euo pipefail

CARMA_ROOT="$(git rev-parse --show-toplevel)"
SUBMODULE="cage/cage-submodule"
CAGE="$CARMA_ROOT/$SUBMODULE"

if [ -L "$CAGE/src" ]; then
  echo "$SUBMODULE/src is a hotlink to $(readlink "$CAGE/src")."
  echo "Unlink in your cage checkout first, a submodule update would fight it."
  exit 1
fi

BEFORE="$(git -C "$CAGE" rev-parse HEAD 2>/dev/null || echo "none")"

git -C "$CARMA_ROOT" submodule update --remote --checkout "$SUBMODULE"

AFTER="$(git -C "$CAGE" rev-parse HEAD)"
DESCRIBE="$(git -C "$CAGE" describe --always --tags)"

git -C "$CARMA_ROOT" add "$SUBMODULE"

echo
echo "was:   $BEFORE"
echo "now:   $AFTER  ($DESCRIBE)"
if [ "$BEFORE" = "$AFTER" ]; then
  echo "The pointer did not move. Has the release run yet?"
else
  echo "Pointer staged. Test locally before you commit."
fi
