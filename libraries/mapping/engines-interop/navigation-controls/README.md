# navigation-controls

Shared runtime-bound navigation controls for Leaflet, MapLibre, and Cesium.

## Role

This package is the intended shared home for:

- cross-engine navigation-control contracts
- runtime adapter composition across Leaflet, MapLibre, and Cesium
- the React-free DOM/mount layer that binds generic control actions to a provided engine-bound methods object

This package is not the home for generic control skinning or `ViewState` provider logic.

## Contract Direction

The target public seam is operation-shaped rather than button-shaped so that Storybook controls, future scripted facades, and engine-switching interop can all call the same commands.

Current direction:

- `setView(...)`
- `flyTo(..., { durationMs })`
- `orbit(..., { durationMs, target })`
- `zoomIn({ mode, durationMs })`
- `zoomOut({ mode, durationMs })`
- `getPosition()`
- engine or mode activation handled one layer up by interop switching

The final `carma.mapping.*` scripting surface can sit on top of this command layer without deep rewrites in the control implementation.

## Related Packages

- Presentation-only control chrome and DOM layout live in [`map-controls-layout`](../../map-controls-layout/README.md).
- Canonical `ViewState` adapters, providers, and runtime bridges live in [`view-state`](../view-state/README.md).
- Cesium-native low-level camera and scene helpers live in [`engines/cesium/api`](../../engines/cesium/api/README.md).
- Leaflet-native low-level map helpers live in [`engines/leaflet`](../../engines/leaflet/README.md).
- MapLibre-native low-level helper guidance lives in [`engines/maplibre-gl`](../../engines/maplibre-gl/README.md).

## Planned Internal Split

- `src/lib/contracts/*`
  Shared callback contracts and non-visual control types.
- `src/lib/dom/*`
  React-free DOM and SVG helpers for the minimal shared control block.
- `src/lib/mount/*`
  Pure host/container mounting for shared controls without Storybook chrome.
- `src/lib/runtime/cesium/*`
  thin Cesium-to-`NavigationMethods` adapter only.
- `src/lib/runtime/leaflet/*`
  Leaflet runtime bindings.
- `src/lib/runtime/maplibre/*`
  MapLibre runtime bindings.

## Current Minimal API

Already available:

- `NavigationMethods<TView>`
- `NAVIGATION_ACTIONS`, `NAVIGATION_ZOOM_MODES`, `NAVIGATION_ORBIT_TARGETS`, `NAVIGATION_COMPASS_CURSORS`
- `runNavigationAction(methods, action)`
- `mountNavigationControlsOverlay(host, options)`
- `createCesiumNavigationMethods({ scene, homeCameraState, ... })`

Cesium-specific low-level runtime helpers now live in:

- [`../../engines/cesium/api/README.md`](../../engines/cesium/api/README.md)
- specifically under `src/lib/carma-helpers/controls/*`

Current reference consumers:

- `Mapping / Controls / Cesium` in Storybook now goes through `createCesiumNavigationMethods(...)` for the Cesium runtime path and only keeps story-local glue for the still-missing Leaflet/MapLibre runtime adapters.
- `playgrounds/annotations` mounts the same shared Cesium control block via `createCesiumNavigationMethods(...)` instead of keeping its own separate Cesium compass/zoom/home implementation.

Intended consumer pattern:

1. Compose one framework-bound `methods` object from `scene` or `map`.
2. Keep buttons framework-agnostic.
3. Buttons call generic actions such as `zoom-in`, `go-home`, or `orbit`.
4. Interop switching swaps the bound `methods` object when the active mapping engine changes.

## Build

```sh
nx build engines-interop-navigation-controls
```

## Test

```sh
nx test engines-interop-navigation-controls
```

## Lint

```sh
nx lint engines-interop-navigation-controls
```
