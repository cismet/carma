# navigation-controls internals

Current internal folders:

- `contracts/`
  shared non-visual control contracts and generic navigation actions
- `dom/`
  React-free DOM/SVG helpers for compass needles and the minimal control block
- `mount/`
  host/container mounting for the shared overlay controls
- `runtime/cesium/`
  thin Cesium-to-`NavigationMethods` adapter only

Planned next folders:

- `runtime/leaflet/`
  Leaflet runtime bindings
- `runtime/maplibre/`
  MapLibre GL JS runtime bindings

Current public seam:

- `NavigationMethods<TView>`
- `runNavigationAction(methods, action)`
- `mountNavigationControlsOverlay(host, options)`
- `createCesiumNavigationMethods(...)`

Cesium-specific low-level helpers now live one layer lower in:

- `@carma/cesium`
- `src/lib/carma-helpers/controls/*`

Compass-specific interaction is handled semantically:

- runtime adapters publish live orientation via `subscribeCompassOrientation(...)`
- the non-React mount layer handles drag/click/double-click locally
- runtime adapters implement `setCompassBearingPitch(...)`, `alignNorth(...)`, and `alignNorthNadir(...)`

That gives consumers two levels:

- bind framework/runtime-specific methods once
- let DOM buttons or other callers trigger generic actions without hardcoding Leaflet/MapLibre GL JS/Cesium branches in the button layer
