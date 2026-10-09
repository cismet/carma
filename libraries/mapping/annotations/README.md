# Annotations

High-level package split and runtime-line policy for the annotations stack.

## Packages

### `core`
- canonical annotation and measurement types
- pure derivations, selectors, and shared geometry helpers
- generic render-model contracts
- engine-agnostic code only

### `runtime`
- current canonical annotations runtime line
- active pluginized runtime package
- the intended long-term runtime package name
- owns runtime host/tooling and remains compatibility-export surface for the shipped built-in tools during the current transition

### `builtin-tools`
- shipped built-in annotation tool plugins and the default bundled tool list
- consumer-facing package for the seven built-in tools
- depends on the runtime host/tooling surface

### `ui`
- reusable annotation info-box UI primitives
- visual defaults and generic info-box layout/components
- no scene/render/runtime orchestration

### `cesium`
- Cesium adapter of the runtime's `AnnotationEngine` contract (`createCesiumAnnotationEngine`, `useCesiumAnnotationEngine`)
- the behaviour the runtime had while it called the Cesium `Scene` directly: projection, picking, pointer tracking, polyline/ring/disc/ground primitives, the Cesium point query and point-move gizmo hooks
- the only annotations package that imports Cesium

### `maplibre`
- MapLibre + Three.js adapter of the same contract (`createMapLibreAnnotationEngine`, `useMapLibreAnnotationEngine`, `useMapLibreLabelOverlayHost`)
- draws lines, discs and fills inside the shared Three.js scene of the map (`acquireSharedThreeScene`), depth-tested against meshes and tilesets, with the occluded part of a line as a dashed depth-fail pass on top
- picks against the shared-scene runtimes that provide terrain or receive the map style, MapLibre terrain as the ground fallback
- `hasMapLibreAnnotationSurfaces` / `subscribeMapLibreAnnotationSurfaces` tell a host whether the mode can run

## Release Positioning

- The first public release after the canonical rename should target `0.1.0`, not `0.0.1`.
- `0.0.1` reads too much like an internal spike or throwaway experiment for this runtime line.
- `0.1.0` better signals an intentional pre-1.0 public line with known follow-up work still open.

## Placement Rules

- semantic measurement meaning belongs in `core`
- runtime authoring, persistence wiring, and UI/workflow orchestration belong in the active runtime line
- engine-specific scene/query/render code belongs in an adapter package (`cesium`, `maplibre`); `runtime` only knows the `AnnotationEngine` contract in `runtime/src/lib/engine/`
- ECEF geometry is `THREE.Vector3`; geodesy comes from `@carma-geo/proj`, plane and disc maths from `core/src/lib/geometry/`
- generic Cesium math belongs in `@carma-cesium`

## Internal Seam Rules

- `builtin-tools` should import shared runtime helpers directly from `@carma-mapping/annotations/runtime`.
- Do not add local re-export seams such as `builtin-tools/src/lib/runtime.ts`.
- Keep cross-package access on explicit named exports from the runtime root `src/index.ts`.
- Tool-specific implementation details stay in `builtin-tools`.

## Replacement Lineage

- The engine contract replaces the direct Cesium `Scene` dependency of `AnnotationsProvider` and the runtime controllers (cismet/carma#680). `annotations/cesium` carries that former behaviour; `annotations/maplibre` is the first second engine.
- The MapLibre adapter's in-scene occluded line pass replaces the DOM/SVG overlay traces of the `Distance Tool Overlay (MapLibre + Three)` Storybook experiment for hidden edges.

## Refactor Status

Active refactor execution tracking is intentionally kept out of this public README.

This README should stay limited to stable package boundaries and release-positioning rules.
