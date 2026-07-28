# carma-api

Public, imperative `carma.*` surface callable from app code and from the browser
devtools console (`window.carma` in dev).

This library is a **stateless leaf**: it holds no state and has **zero
`@carma-*` runtime deps**. Apps register adapters per namespace at bootstrap;
the facades delegate every call into the registered adapter.

## Using it

```ts
import { carma } from "@carma-api";

carma.mapping.getMode();                     // "2d" | "3d" | null

// 2D (leaflet)
carma.mapping2D.activate();
carma.mapping2D.getPosition();               // { lat, lng, zoom } | null
carma.mapping2D.flyTo(lat, lng, zoom?);
carma.mapping2D.zoomIn();
carma.mapping2D.zoomOut();
carma.mapping2D.hasLayer(id);
carma.mapping2D.addLayer(id);                // Promise<boolean>
carma.mapping2D.removeLayer(id);
carma.mapping2D.getLayerIDs();
carma.mapping2D.getBackgroundLayers();        // [{ id, title, group }] — possible base maps
carma.mapping2D.setBackgroundLayer(id);      // switch base map, e.g. "stadtplan"

// 3D (cesium)
carma.mapping3D.activate();
carma.mapping3D.getCameraPosition();
carma.mapping3D.flyTo(lon, lat, height?);
carma.mapping3D.zoomIn();
carma.mapping3D.zoomOut();

carma.ui.openMenu();
carma.ui.openHelperOverlay();

// gazetteer search
const removeMode = carma.gazetteer.addMode({
  key: "bplaene",
  label: "Bebauungspläne",
  sources: [{ topic: "bplaene.v2", url: "...", crs: "3857" }],
});                                          // extra mode in the search dropdown
carma.gazetteer.addSource({ topic, url, crs }); // extra source in the default search
removeMode();                                // contributions return their remover
```

In dev, the same object is attached to `window.carma` so you can poke at it
from the browser console.

## Namespaces

Currently shipped: `mapping`, `ui`, `gazetteer`.

Planned (not yet implemented): `auth`, `print`, ...

## How to add a namespace

A namespace belongs in `carma-api` only if it is a **public imperative
surface** (console-usable, app-callable). Internal module helpers do **not**
belong here.

**Library side** (`libraries/carma-api/src/`):

1. Create `lib/<namespace>.ts` containing:
   - The `Adapter` and `Facade` interfaces (plus any value types).
   - A single `createNamespace<Adapter, Facade>((get) => ({ ... }))` call that
     exports the facade and the `register<Namespace>` function.
2. In `src/index.ts`:
   - Import the facade and merge it into the `carma` object.
   - Re-export `register<Namespace>` and the public types.

Example (`lib/foo.ts`):

```ts
import { createNamespace } from "./create-namespace";

export interface FooAdapter {
  doThing?: (id: string) => boolean;
}

export interface FooFacade {
  doThing: (id: string) => boolean;
}

export const { facade: foo, register: registerFoo } = createNamespace<
  FooAdapter,
  FooFacade
>((get) => ({
  doThing: (id) => get()?.doThing?.(id) ?? false,
}));
```

**App side** (`libraries/appframeworks/portals/src/lib/components/carma-api-bridge/`):

1. Create `use<Namespace>Adapter.ts` next to the others. It grabs the hooks
   that namespace needs, builds the adapter, and registers it in one
   `useLayoutEffect` that calls `register<Namespace>` (returning
   `register<Namespace>(null)` for cleanup). This mirrors the library's
   one-file-per-namespace layout, so it stays obvious where each function
   comes from.
2. Call the new hook from `CarmaApiBridge.tsx`.

`CarmaApiBridge` stays a **single component** for every namespace (it just
delegates to the per-namespace hooks). Do **not** create a second bridge
component.

## Adding a function to an existing namespace

Three edits:

1. Add it to the `Adapter` interface (optional `?: (...) => ...` if apps may
   not implement it) and the `Facade` interface (required, with a sensible
   default when unset).
2. Wire the facade impl in the `createNamespace` call:
   `newFn: (id) => get()?.newFn?.(id) ?? defaultValue`.
3. Implement the closure in that namespace's `use<Namespace>Adapter.ts`
   (in `appframeworks/portals/src/lib/components/carma-api-bridge/`).

## Design rules

- **Null over throw.** Getters return `null` / `false` / `[]` when the adapter
  is unset or the app doesn't implement the method. Callers don't have to
  `try/catch`.
- **Primitives in, primitives out.** The adapter exposes and the facade
  returns plain data. This library never imports leaflet, cesium, redux, or
  any `@carma-*` package at runtime.
- **Stable facade identity.** The `carma.*.someMethod` reference never
  changes; only the adapter ref inside the namespace mutates. Safe to hold
  references, safe to attach to `window`.

## Lint

```sh
nx lint carma-api
```
