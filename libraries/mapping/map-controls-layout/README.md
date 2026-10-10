# map-controls-layout

Layout, chrome, and styling primitives for map controls.

For runtime-bound cross-engine navigation control composition, see [`../engines-interop/navigation-controls/README.md`](../engines-interop/navigation-controls/README.md).

## Rendering

Each `Control` registers its slot (position and order) and its content in a per-layout registry (`src/lib/control-registry.ts`). `ControlRenderer` subscribes to the slot list only, and each slot subscribes to its own content, so a content change re-renders just that control. Adding, removing or moving a control re-renders the renderer.

## Test

```sh
npx vitest run --config libraries/mapping/map-controls-layout/vite.config.ts
```

## Build

```sh
nx build mapping-map-controls-layout
```

## Storybook

```sh
nx storybook mapping-map-controls-layout
nx build-storybook mapping-map-controls-layout
```

## Lint

```sh
nx lint mapping-map-controls-layout
```
