# @carma-mapping/addons

Addons extend a map app per route (in the geoportal: per Fachzwilling) without
touching the app itself. Every addon is declared in the route config as a
uniform pair:

```ts
{ kind: "<addon kind>", config: { /* kind-specific config */ } }
```

The `kind` selects a component registered in
[`registry.ts`](./src/lib/registry.ts); the `config` is the typed payload for
that kind. All addon wiring lives in `src/lib`:

| File                       | Role                                                         |
| -------------------------- | ------------------------------------------------------------ |
| `registry.ts`              | Kind and config types plus the kind -> component lookup      |
| `AddonHost.tsx`            | Mounts the components of the active route's addons           |
| `GazetteerSourceAddon.tsx` | Built-in kind: extra source for the default gazetteer search |
| `GazetteerModeAddon.tsx`   | Built-in kind: extra mode in the gazetteer mode dropdown     |

The library expects the host app to provide the carma api adapters
(`CarmaMapProviderWrapper`), the react-cismap `TopicMapContext` and a
react-redux provider; `AddonHost` reads the store from that provider via
`useStore()`, so it stays independent of any app's store type.

## How addons flow through the app

1. A route config declares `addons: Addon[]`. In the geoportal that is
   `FachzwillingRoute` (see
   `apps/geoportal/src/app/constants/fachzwillinge/index.ts`).
2. `main.tsx` resolves the active route and passes its addons to `App`.
3. `App` renders `<AddonHost addons={addons} />` inside
   `CarmaMapProviderWrapper`. The host looks each addon's `kind` up in
   `addonRegistry` and mounts the component with the shared interaction props.
4. When the user navigates to another route, the host unmounts the components;
   an addon's entire lifecycle is its mount time, cleanup belongs in its effect
   teardowns.

Every addon is a component; there is no separate config-derivation path. The
gazetteer kinds work by registering their sources/modes through
`carma.gazetteer` at runtime (see below); the `GazDataProvider` merges them
into its config and reloads.

## Creating a new addon kind

### 1. Add the config type

In `registry.ts`, extend `AddonConfigMap` with the kind's name and config type:

```ts
export type AddonConfigMap = {
  gazetteerSource: GazDataSourceConfig;
  gazetteerMode: GazDataAdditionalModeConfig;
  cameraTour: CameraTourConfig; // new
};
```

`Addon` and `AddonComponentProps` update automatically; route configs get full
type checking on the new `config` shape, and the registry will not compile
until the new kind has a component.

### 2. Write the component

Create the component in `src/lib` (one file per kind) and export it from
`src/index.ts`. It receives `AddonComponentProps<"yourKind">` and typically
renders `null`; it interacts with the app through its props:

```tsx
import { useEffect } from "react";
import type { AddonComponentProps } from "./registry";

export const CameraTourAddon = ({
  config,
  carma,
  leafletMap,
  libreMap,
  store,
}: AddonComponentProps<"cameraTour">) => {
  useEffect(() => {
    // imperative carma api: mode switching, layers, camera, ui
    carma.mapping2D.flyTo(config.start.lat, config.start.lng, config.zoom);

    // raw map instances of the two 2d engines; only the active engine's map is
    // set, so keep them in the effect deps and guard on the one you need
    libreMap?.on("moveend", handleMoveEnd);

    if (!leafletMap) {
      return;
    }
    leafletMap.on("moveend", handleMoveEnd);

    // the host app's redux store, for reads and dispatches outside react;
    // it is untyped here, so cast to the app's state where you need it
    const uiMode = (store.getState() as AppState).ui.mode;

    return () => {
      libreMap?.off("moveend", handleMoveEnd);
      leafletMap.off("moveend", handleMoveEnd);
    };
  }, [config, carma, leafletMap, libreMap, store]);

  return null;
};
```

The shared props are:

| Prop         | Type                        | Use for                                                     |
| ------------ | --------------------------- | ----------------------------------------------------------- |
| `config`     | `AddonConfigMap[K]`         | The addon's own config from the route declaration           |
| `carma`      | `typeof carma` (@carma-api) | Imperative api: map mode, layers, camera, ui, gazetteer     |
| `leafletMap` | `LeafletMap \| null`        | The leaflet map instance, `null` while it is unmounted      |
| `libreMap`   | `maplibregl.Map \| null`    | The maplibre map instance, `null` while it is unmounted     |
| `store`      | `Store` (redux)             | Redux reads/dispatches outside the react tree               |

`GazetteerModeAddon` is the canonical example of an addon that extends the
app through the carma api; `addMode`/`addSource` return their remover,
so the registration is exactly one effect:

```tsx
export const GazetteerModeAddon = ({
  config,
  carma,
}: AddonComponentProps<"gazetteerMode">) => {
  useEffect(() => carma.gazetteer.addMode(config), [config, carma]);
  return null;
};
```

Because the host renders inside the full provider tree, addon components may
also use hooks directly when that is more convenient: `useSelector` /
`useDispatch`, `useGazData`, cesium context hooks, etc. Prefer the props for
anything they already cover; they keep the component decoupled from app
internals.

### 3. Register the component

```ts
import { CameraTourAddon } from "./CameraTourAddon";

export const addonRegistry: {
  [K in AddonKind]: ComponentType<AddonComponentProps<K>>;
} = {
  gazetteerSource: GazetteerSourceAddon,
  gazetteerMode: GazetteerModeAddon,
  cameraTour: CameraTourAddon,
};
```

### 4. Declare the addon on a route

In the app's route config (geoportal:
`apps/geoportal/src/app/constants/fachzwillinge/<route>.ts`):

```ts
export const bodenFachzwilling: FachzwillingRoute = {
  path: "boden",
  // ...
  addons: [
    {
      kind: "gazetteerMode",
      config: {
        key: "bplaene",
        label: "Bebauungspläne",
        // ...
      },
    },
    { kind: "cameraTour", config: { start: { lat: 51.256, lng: 7.15 }, zoom: 16 } },
  ],
};
```

That is all; there is no further wiring.


## Guidelines

- One component per addon kind, in its own file in `src/lib`.
- Addon components must render `null` or self-contained UI; they must not
  assume anything about the surrounding layout.
- Register api-based extensions (gazetteer modes, layers, ...) in `useEffect`
  and return the remover as the cleanup, so route switches cleanly undo them.
