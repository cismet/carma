# navigation-controls

Shared runtime-bound navigation controls for Leaflet, MapLibre GL JS, and Cesium.

## Role

This package is the intended shared home for:

- cross-engine navigation-control contracts
- runtime adapter composition across Leaflet, MapLibre GL JS, and Cesium
- the React-free DOM/mount layer that binds generic control actions to a provided engine-bound methods object

This package is not the home for generic control skinning or `ViewState` provider logic.

## Contract Direction

The target public seam is operation-shaped rather than button-shaped so that Storybook controls, future scripted facades, and engine-switching interop can all call the same commands.

Current direction:

- `setView(...)`
- `flyTo(..., { duration })`
- `orbit(..., { duration, target })`
- `zoomIn({ mode, duration })`
- `zoomOut({ mode, duration })`
- `getPosition()`
- engine or mode activation handled one layer up by interop switching

Animated navigation commands may additionally carry lightweight lifecycle
callbacks via `NavigationTransitionLifecycle` / `NavigationTransitionOptions`.
`NavigationZoomOptions` inherits these hooks, and the same lifecycle is intended
for other finite animated actions such as `flyTo`, home transitions, or
compass-triggered alignment transitions:

- `onStarted`
- `onCompleted`
- `onCanceled`

These hooks are intended for transition-adjacent concerns such as temporary
render-scale adaptation or status instrumentation, not for owning camera state.

The final `carma.mapping.*` scripting surface can sit on top of this command layer without deep rewrites in the control implementation.

## Engine Implementation Reference

All methods are part of `NavigationMethods<TView>`. The home pose is fixed at construction time (not passed per call). Duration `0` means instant; duration absent uses the engine default (900 ms for `goHome`, 250–500 ms for zoom).

### `goHome(options?: NavigationTransitionOptions)`

| | Leaflet | MapLibre GL JS | Cesium |
|---|---|---|---|
| animated | `map.flyTo(center, zoom, { duration: s })` | `map.easeTo({ ...camera, duration: ms })` | `flyToCameraState(scene, state, { duration: s })` |
| instant (`duration: 0`) | `map.setView(center, zoom)` | `map.jumpTo(camera)` | `setViewFromCameraState(scene.camera, state)` |
| home pose source | closed over `homeTarget: ViewState` | closed over `homeTarget: ViewState` | closed over `homeCameraState` |

### `setView(state: ViewState)`

| | Leaflet | MapLibre GL JS | Cesium |
|---|---|---|---|
| always instant | `map.setView(center, zoom)` | `map.jumpTo(camera)` | `applyViewStateToCesiumWidget(widget, state)` |

### `flyTo(state: ViewState, options?: NavigationTransitionOptions)`

| | Leaflet | MapLibre GL JS | Cesium |
|---|---|---|---|
| animated | `map.flyTo(center, zoom, { duration: s })` | `map.easeTo({ ...camera, duration: ms })` | `flyToCameraState(scene, state, { duration: s })` |
| instant (`duration: 0`) | `map.setView(center, zoom)` | `map.jumpTo(camera)` | `setViewFromCameraState(scene.camera, state)` |

### `zoomIn(options?: NavigationZoomOptions)` / `zoomOut(options?: NavigationZoomOptions)`

Modes: `auto` (travel/range), `fov` (perspective FOV only), `dolly` (travel + FOV synchronized). Leaflet and MapLibre GL JS only support `auto`.

| | Leaflet | MapLibre GL JS | Cesium `auto` | Cesium `fov` | Cesium `dolly` |
|---|---|---|---|---|---|
| animated | `map.setZoom(n, { animate: true })` | `map.easeTo({ zoom: n, duration: ms })` | `animateCesiumSceneTravelZoom` | `flyCesiumSceneFovZoom` | `animateCesiumSceneTravelZoom` + synchronized FOV target |
| instant (`duration: 0`) | `map.setZoom(n, { animate: false })` | `map.jumpTo({ zoom: n })` | `animateCesiumSceneTravelZoom` (durationMs 0) | `flyCesiumSceneFovZoom` (durationMs 0) | same, durationMs 0 |
| default duration | 250 ms | 250 ms | 500 ms | 250 ms | 500 ms |
| `zoomDelta` | snapped to `zoomSnap` | snapped to `zoomSnap` | scene range step | FOV step | scene range + FOV step |

### `orbit(options?: NavigationOrbitOptions)`

Toggle: calling while active stops the orbit. Not supported on Leaflet.

| | Leaflet | MapLibre GL JS | Cesium |
|---|---|---|---|
| not supported | no-op | — | — |
| start | — | `render` loop: `transform.setBearing(bearing - speed·dt)`, fires `move`/`rotate` | `CesiumSceneOrbitController`: quaternion rotation around surface normal |
| stop | — | cancel `render` listener | `stopOrbit()` on controller |
| drag during orbit | — | allowed — bearing delta applied on top each frame | allowed — controller pauses/resumes via `ScreenSpaceEventHandler` |
| pitch correction | — | eases pitch toward `minPitchDeg` at 60°/s | rotates camera elevation toward `minPitchDeg` at ~60°/s |
| center point | — | current map center (fixed at start) | `readCachedCesiumSceneCenter`, updated on drag/zoom |
| options | `direction`, `revolutionDurationSec`, `minPitchDeg` | `direction`, `revolutionDurationSec`, `minPitchDeg` | `direction`, `revolutionDurationSec`, `minPitchDeg` |

### `alignNorth(options?: NavigationTransitionOptions)`

| | Leaflet | MapLibre GL JS | Cesium |
|---|---|---|---|
| action | no-op (always north) | `map.easeTo({ bearing: 0, duration: ms })` | `camera.lookAt(center, HeadingPitchRange(0, pitch, range))` |

### `alignNorthNadir(options?: NavigationTransitionOptions)`

| | Leaflet | MapLibre GL JS | Cesium |
|---|---|---|---|
| action | no-op | `map.easeTo({ bearing: 0, pitch: 0, duration: ms })` | `camera.lookAt(center, HeadingPitchRange(0, MIN_PITCH, range))` |

## Related Packages

- Presentation-only control chrome and DOM layout live in [`map-controls-layout`](../../map-controls-layout/README.md).
- Canonical `ViewState` adapters, providers, and runtime bridges live in [`view-state`](../view-state/README.md).
- Cesium-native low-level camera and scene helpers live in [`engines/cesium/api`](../../engines/cesium/api/README.md).
- Leaflet-native low-level map helpers live in [`engines/leaflet`](../../engines/leaflet/README.md).
- MapLibre GL JS-native low-level helper guidance lives in [`engines/maplibre-gl`](../../engines/maplibre-gl/README.md).

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
  MapLibre GL JS runtime bindings.

## Current Minimal API

Already available:

- `NavigationMethods<TView>`
- `NAVIGATION_ACTIONS`, `NAVIGATION_ZOOM_MODES`, `NAVIGATION_ZOOM_DIRECTIONS`, `NAVIGATION_ORBIT_TARGETS`, `NAVIGATION_COMPASS_CURSORS`
- `runNavigationAction(methods, action)`
- `mountNavigationControlsOverlay(host, options)`
- `createCesiumNavigationMethods(scene, { homeCameraState, ... })`

Cesium-specific low-level runtime helpers now live in:

- [`../../engines/cesium/api/README.md`](../../engines/cesium/api/README.md)
- specifically under `src/lib/carma-helpers/controls/*`

Current reference consumers:

- `Mapping / Controls / Cesium` in Storybook now goes through `createCesiumNavigationMethods(...)` for the Cesium runtime path and only keeps story-local glue for the still-missing Leaflet/MapLibre GL JS runtime adapters.
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
