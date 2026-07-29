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

| File                        | Role                                                          |
| --------------------------- | ------------------------------------------------------------- |
| `registry.ts`               | Kind and config types plus the kind -> entry lookup           |
| `AddonHost.tsx`             | Mounts the active route's addons                              |
| `TargetAddonHost.tsx`       | Mounts one addon declared on a stack entry                    |
| `target-addons.ts`          | Trigger ids and the entry lookups the layer button needs      |
| `GazetteerSourceAddon.tsx`  | Built-in kind: extra source for the default gazetteer search  |
| `GazetteerModeAddon.tsx`    | Built-in kind: extra mode in the gazetteer mode dropdown      |
| `LayerVisibilityAddon.tsx`  | Built-in kind: per-member visibility toggles for a group      |

The library expects the host app to provide the carma api adapters
(`CarmaMapProviderWrapper`), the react-cismap `TopicMapContext` and a
react-redux provider; `AddonHost` reads the store from that provider via
`useStore()`, so it stays independent of any app's store type.

## The two declaration sites

The same registry serves both. Where a kind is declared is what decides how it is
mounted and what it acts on; there is no `scope` field.

| Declared on                             | Mounted by         | `target` | Lifetime                        |
| --------------------------------------- | ------------------ | -------- | ------------------------------- |
| a route's `addons: Addon[]`             | `AddonHost`        | `null`   | the whole route                 |
| a stack entry's `tools: AddonEntry[]`   | `TargetAddonHost`  | that entry | while the entry is in the stack |

A kind that needs a target guards on it rather than assuming one, which is also what
lets one kind serve both sites.

### Route addons

1. A route config declares `addons: Addon[]`. In the geoportal that is
   `FachzwillingRoute` (see
   `apps/geoportal/src/app/constants/fachzwillinge/index.ts`).
2. `main.tsx` resolves the active route and passes its addons to `App`, which
   hands them to `MapWrapper`.
3. `MapWrapper` renders `<AddonHost addons={addons} />` **inside `ControlLayout`**.
   The host looks each addon's `kind` up in `addonRegistry` and mounts the
   component with the shared interaction props.
4. When the user navigates to another route, the host unmounts the components;
   an addon's entire lifecycle is its mount time, cleanup belongs in its effect
   teardowns.

### Workflow tools

A workflow declares `tools`, which travel
`WorkflowDefinition.tools` -> `Item.tools` -> `LayerGroup.tools`, so the addons land
on the group the workflow creates. Entries may be a bare kind or the full
`{ kind, config }` form.

`@carma-mapping/layers` types this field as the structural `ToolEntry`, not as
`AddonEntry`, because typing the layer contract against this registry would make the
two libraries circular. Declaration sites keep full kind checking by narrowing the
`WorkflowPerspective<TTool>` type parameter, as the geoportal does with
`WorkflowPerspective<AddonEntry>`.

## Where an addon's UI ends up

There is no `surface` field. An addon renders whatever it wants, and one optional
registry field decides where that lands:

| Entry                            | Clicking the trigger      | Renders                                    |
| -------------------------------- | ------------------------- | ------------------------------------------ |
| `layerButton` with `onClick`     | runs the action at once   | nothing; the kind needs no `Component`     |
| `layerButton` without `onClick`  | toggles the kind's panel  | `Component`, in the interaction view       |
| no `layerButton`                 | (no trigger)              | `Component`, mounted by the addon host, wherever it renders, including `<Control>` |

Because each entry has exactly one mount point, a tool with a trigger is never also
mounted headlessly.

**Map UI needs nothing from the registry.** `Control` from
`@carma-mapping/map-controls-layout` registers its children with the layout rather
than rendering them in place, so any addon may position itself on the map:

```tsx
export const SomeAddon = ({ config }: AddonComponentProps<"someKind">) => (
  <Control position="topright" order={10}>
    <SomePanel {...config} />
  </Control>
);
```

This works because `AddonHost` is mounted inside `ControlLayout`.

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
  target,
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
| `config`     | `AddonConfigMap[K]`         | The addon's own config from the declaration                 |
| `carma`      | `typeof carma` (@carma-api) | Imperative api: map mode, layers, camera, ui, gazetteer     |
| `leafletMap` | `LeafletMap \| null`        | The leaflet map instance, `null` while it is unmounted      |
| `libreMap`   | `maplibregl.Map \| null`    | The maplibre map instance, `null` while it is unmounted     |
| `store`      | `Store` (redux)             | Redux reads/dispatches outside the react tree               |
| `target`     | `LayerStackEntry \| null`   | The stack entry the addon acts on; `null` for route addons  |

`target` is what lets one kind serve two declaration sites. An addon declared in a
route's `addons` acts route-wide and receives `null`; the same kind declared in a
stack entry's `tools` receives that entry. A kind that needs a target should guard on
it rather than assume one.

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
  [K in AddonKind]: AddonRegistryEntry<K>;
} = {
  gazetteerSource: { Component: GazetteerSourceAddon },
  gazetteerMode: { Component: GazetteerModeAddon },
  cameraTour: { Component: CameraTourAddon },
};
```

The entry is a record rather than the component alone so a kind can declare metadata
the host needs before the component renders.

### 4. Optionally, opt in to a layer-button trigger

A kind that should be opened from a stack entry's layer button adds `layerButton`.
The component then renders as that trigger's panel:

```ts
export const cameraTourLayerButton: AddonLayerButton<"cameraTour"> = {
  icon: faVideo,
  label: ({ config }) => config?.buttonLabel ?? "Kameratour",
  // optional count on the trigger
  badge: ({ target }) => stops(target).length,
  // no trigger when this target cannot support the kind
  isApplicable: ({ target }) => stops(target).length > 0,
};
```

`label`, `badge` and `isApplicable` receive `{ config, target }`, so the button can
reflect the entry it belongs to. `isApplicable` returning false hides the trigger
entirely, which is also what makes a target-dependent kind harmless if it is ever
declared on a route, where `target` is `null`.

**Action kinds: do the thing on click, open nothing.** Add `onClick` and the trigger
behaves like the measurement layer's layerbar actions rather than a panel toggle. The
kind then needs no `Component`, and its entry is just the button:

```ts
export const zoomToLayerButton: AddonLayerButton<"zoomTo"> = {
  icon: faSearchLocation,
  label: ({ config }) => config?.buttonLabel ?? "Auf die Gruppe zoomen",
  isApplicable: ({ target }) => Boolean(unionExtent(target)),
  onClick: ({ target, carma }) => {
    const extent = unionExtent(target);
    if (extent) {
      carma.mapping2D.fitBounds(...extent);
    }
  },
};

export const addonRegistry = {
  // ...
  zoomTo: { layerButton: zoomToLayerButton },
};
```

`onClick` additionally receives `carma`, so an action can reach the app without a
component around it. Prefer an action over a panel holding a single button.

`zoomTo` is the canonical example of both features: it is an action, and it hides
its own trigger when no member layer's service declared an extent, so the button never
appears with nothing to do.

### 5. Declare the addon

Either on a route, or on a workflow, or both. On a route, in the app's route config
(geoportal: `apps/geoportal/src/app/constants/fachzwillinge/<route>.ts`):

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

On a workflow, in the same route file's `perspectives`, where the bare-kind shorthand
is available for kinds whose config can be omitted:

```ts
workflows: [
  {
    id: "einrichtungen",
    title: "Gesundheitseinrichtungen",
    layers: ["wuppPOI:poi_krankenhaeuser", "wuppInfra:apotheken"],
    tools: [
      "layerVisibility",
      { kind: "zoomTo", config: { buttonLabel: "Auf die Gruppe zoomen" } },
    ],
  },
],
```

Each declared tool with a `layerButton` gets its own trigger in the group's layer
button, in declaration order. Opening one closes the others.

That is all; there is no further wiring.


## Guidelines

- One component per addon kind, in its own file in `src/lib`.
- Addon components must render `null` or self-contained UI; they must not
  assume anything about the surrounding layout.
- Register api-based extensions (gazetteer modes, layers, ...) in `useEffect`
  and return the remover as the cleanup, so route switches cleanly undo them.
