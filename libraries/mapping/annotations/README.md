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

## Release Positioning

- The first public release after the canonical rename should target `0.1.0`, not `0.0.1`.
- `0.0.1` reads too much like an internal spike or throwaway experiment for this runtime line.
- `0.1.0` better signals an intentional pre-1.0 public line with known follow-up work still open.

## Placement Rules

- semantic measurement meaning belongs in `core`
- runtime authoring, persistence wiring, and UI/workflow orchestration belong in the active runtime line
- Cesium scene/query/render runtime belongs in the runtime’s engine-facing layers
- generic Cesium math belongs in `@carma-cesium`

## Internal Seam Rules

- `builtin-tools` should import shared runtime helpers directly from `@carma-mapping/annotations/runtime`.
- Do not add local re-export seams such as `builtin-tools/src/lib/runtime.ts`.
- Keep cross-package access on explicit named exports from the runtime root `src/index.ts`.
- Tool-specific implementation details stay in `builtin-tools`.

## Refactor Status

Active refactor execution tracking is intentionally kept out of this public README.

This README should stay limited to stable package boundaries and release-positioning rules.
