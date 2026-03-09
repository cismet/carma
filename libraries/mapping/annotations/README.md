# Annotations Architecture

This folder is split by responsibility, not by framework widget.

## Packages

### `core`
- owns canonical annotation and measurement types
- owns pure derivations, selectors, formatting, and shared geometry helpers
- owns generic render-model contracts
- must stay engine-agnostic

### `provider`
- owns draft state, commands, persistence wiring, and UI orchestration
- owns per-measurement-type controllers
- maps domain state to generic render models
- should be the only layer that knows the full measurement workflow

### `cesium`
- owns Cesium scene services and renderers only
- projects world to screen, queries scene state, and syncs primitives/overlays
- consumes already-partitioned render models from `provider`
- must not decide what a measurement means

## Placement Rules

- If code answers "what is this measurement?" it belongs in `core`.
- If code answers "what is the user currently doing?" it belongs in `provider`.
- If code answers "how do we render/query this in Cesium?" it belongs in `cesium`.
- Generic Cesium math should move to `@carma/cesium`, not stay here.

## Target Shape

The target architecture is per measurement type:
- point
- distance
- polyline
- ground area
- planar area
- vertical area
- label

Each type should eventually have:
- a canonical type in `core`
- draft/controller logic in `provider`
- derived render-model builders in `provider`
- engine renderers in `cesium`

## Anti-Patterns

- catch-all types that mix semantic type, draft state, derived geometry, and style
- provider monoliths that own all measurement kinds inline
- Cesium hooks branching on measurement semantics
- wrapper-only hooks/files that do not reduce coupling
