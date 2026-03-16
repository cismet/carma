# @carma-mapping/engines-interop

Interoperability utilities between different CARMA mapping engines.

## Features

### Transitions

Smooth 2D ↔ 3D transitions between different mapping engines:
- **Leaflet ↔ Cesium**: Coordinate 2D tile maps with 3D globe views
- Camera state synchronization
- Container visibility management
- Animation orchestration

### View Sync

Generic multi-engine view coordination with a canonical object-centric target state:
- internal target format: `lat/lon/alt + heading/pitch/range`
- multiple map instances can register with one coordinator store
- one active controller publishes the consolidated target state
- pure helpers project the canonical target to:
  - MapLibre-like `lat/lng/zoom/bearing/pitch`
  - Leaflet-like `lat/lng/zoom` with optional heading

The implementation is split into:
- `view-sync/core`: pure store + target/projection helpers
- `view-sync/react`: thin provider/hooks for React consumers

## Architecture

This library provides engine-interop logic.

- Pair-specific transition math and orchestration stay in dedicated interop folders.
- Generic cross-engine coordination lives in `view-sync`.
- React usage is limited to thin provider/hooks layers above pure stores/helpers.
