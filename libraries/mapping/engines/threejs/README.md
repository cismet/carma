# engines/threejs/ (legacy location)

To be moved to `engines/three/runtime/`.

New Three.js engine code should go in `engines/three/`.

## 3D Tiles lifecycle replacement

The unused `buildTiles3dLayer` custom-layer implementation and exports were
removed during `TILE-CONSOLIDATION-20260914`. MapLibre mesh consumers use
`buildThreeTilesRuntime` from `@carma-mapping/engines/maplibre` and its shared
scene lease instead. This package retains reusable Three primitives, LOD camera
construction and decoding plugins, not a second download/cache policy.
See `libraries/mapping/engines/maplibre/TILES_COVERAGE.md` for the consolidation
boundary and remaining acceptance work.
