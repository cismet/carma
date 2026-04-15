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

### `ui`
- reusable annotation info-box UI primitives
- visual defaults and generic info-box layout/components
- no scene/render/runtime orchestration

### `runtime-prototype`
- legacy prototype runtime line
- preserved temporarily for comparison and migration support
- intentionally not the long-term canonical runtime package name

## Runtime Line Policy

- Treat `runtime` as the canonical annotations runtime line.
- Treat `runtime-prototype` as a temporary legacy line only.
- The target end state is:
  - `libraries/mapping/annotations/runtime/` remains the canonical runtime package
  - `libraries/mapping/annotations/runtime-prototype/` is removed
- No new work should prefer `runtime-prototype` over `runtime` except explicit prototype maintenance.

## Release Positioning

- The first public release after the canonical rename should target `0.1.0`, not `0.0.1`.
- `0.0.1` reads too much like an internal spike or throwaway experiment for this runtime line.
- `0.1.0` better signals an intentional pre-1.0 public line with known follow-up work still open.
- Removal of the current `runtime-prototype` line remains a release precondition for that first public canonical runtime release.

## Placement Rules

- semantic measurement meaning belongs in `core`
- runtime authoring, persistence wiring, and UI/workflow orchestration belong in the active runtime line
- Cesium scene/query/render runtime belongs in the runtime’s engine-facing layers
- generic Cesium math belongs in `@carma-cesium`

## Refactor Status

Active refactor execution tracking is intentionally kept out of this public README.

This README should stay limited to stable package boundaries and release-positioning rules.
