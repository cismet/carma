# Annotations

High-level package split for the annotations stack.

## Packages

### `core`
- canonical annotation and measurement types
- pure derivations, selectors, and shared geometry helpers
- generic render-model contracts
- engine-agnostic code only

### `provider`
- draft state, commands, persistence wiring, and UI/workflow orchestration
- annotation-specific edit and gizmo mapping
- mapping domain state to render models

### `cesium`
- Cesium scene services and renderers only
- world-to-screen projection, picking, visibility, and primitive/overlay sync
- consumes provider-built render inputs

## Placement Rules

- semantic measurement meaning belongs in `core`
- user workflow and draft state belong in `provider`
- Cesium scene/query/render runtime belongs in `cesium`
- generic Cesium math belongs in `@carma-cesium`

## Refactor Status

Ongoing architecture cleanup and target-shape decisions live in the local spec:

- [.dev-local/specs/mapping/annotations/ARCHITECTURE_SPLIT_SPEC.md](/Users/friedrich/cisgit/carma/.dev-local/specs/mapping/annotations/ARCHITECTURE_SPLIT_SPEC.md)

That spec is the active work document for the current measurement refactor. This README should stay limited to stable package boundaries.
