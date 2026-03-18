# @carma-mapping/engines-interop

Interoperability utilities between different CARMA mapping engines.

## Separation of concerns

`@carma-mapping/engines-interop` owns reusable engine/view interoperability logic.

- It defines canonical view-state/target abstractions and pure transforms between engine representations.
- It provides shared transition and projection helpers that are engine-agnostic at the contract level.
- It does **not** own URL hash-state persistence concerns.
- It does **not** own app/domain launch policy interpretation (for example deciding startup mode from hash values).

In short: engines-interop handles reusable view-state and engine conversion logic; hash parsing/persistence stays in hash-state, and domain policy stays in higher-level reusable hooks/providers.

## Features

### Transitions

Smooth 2D ↔ 3D transitions between different mapping engines:
- **Leaflet ↔ Cesium**: Coordinate 2D tile maps with 3D globe views
- Camera state synchronization
- Container visibility management
- Animation orchestration

### View Sync

Generic multi-engine view coordination with a canonical object-centric target state:
- internal target format: `lat/lon/alt + bearing/pitch/range`
- internal pose convention:
  - right-handed local tangent ENU frame embedded into a Three-compatible scene basis
  - `+X = east`
  - `+Y = up`
  - `-Z = north`
  - `bearing`: positive around `+Y` from north toward east
  - `pitch`: `0 = nadir`, `+PI/2 = horizon`
- multiple map instances can register with one coordinator store
- one active controller publishes the consolidated target state
- pure helpers project the canonical target to:
  - MapLibre-like `lat/lng/zoom/bearing/pitch`
  - Leaflet-like `lat/lng/zoom` with optional bearing

The implementation is split into:
- `view-sync/core`: pure store + target/projection helpers
- `view-sync/react`: thin provider/hooks for React consumers

### Adapter composition

`view-sync/core/adapters` is the dedicated conversion layer between framework view values and shared `SceneViewState`.

- `maplibreAdapter.viewToCarma(...)` / `maplibreAdapter.carmaToView(...)`
- `leafletAdapter.viewToCarma(...)` / `leafletAdapter.carmaToView(...)`
- `maplibreAdapter.carmaToHashParams(...)` for shared map hash params (`lat/lng/zoom/altitude/bearing/pitch/fov`)

Typical flow:

1. Engine/framework view values -> `SceneViewState` via adapter.
2. `SceneViewState` remains the canonical cross-engine transport shape.
3. Caller composes with hash-state for persistence (`encodeHashParams(...)`) outside interop.

This keeps conversion logic in interop and persistence/URL concerns in hash-state.

## Architecture

This library provides engine-interop logic.

- Pair-specific transition math and orchestration stay in dedicated interop folders.
- Generic cross-engine coordination lives in `view-sync`.
- React usage is limited to thin provider/hooks layers above pure stores/helpers.
