# @carma-mapping/engines/cesium/core

Low-level Cesium engine helper layer.

This package is the home for repo-owned Cesium helpers that are not themselves
the curated raw Cesium namespace.

Use this package for:

- guards
- serialization and constructor-arg codecs
- scene, camera, terrain, and picking helpers
- CesiumWidget-only helper factories
- repo-owned transforms around Cesium values

Do not use this package as a replacement for raw Cesium imports. Raw curated
Cesium symbols belong in [`@carma-cesium`](../api/README.md).

See also:

- [`src/lib/carma-helpers/scene/README.md`](./src/lib/carma-helpers/scene/README.md)
  for low-latency cursor picking and reprojection guidance.
