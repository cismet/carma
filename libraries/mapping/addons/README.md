# @carma-mapping/addons

Addons extend a map app per route (in the geoportal: per Fachzwilling) without
touching the app itself. Every addon is declared in the route config as a
uniform pair:

```ts
{ kind: "<addon kind>", config: { /* kind-specific config */ } }
```

The `kind` selects a component registered in
[`registry.ts`](./src/lib/registry.ts); the `config` is the typed payload for
that kind. A kind whose config is entirely optional may be declared as the bare
kind instead, which is how a route asks for the addon's own defaults:

```ts
addons: ["cameraRestriction"]; // same as { kind: "cameraRestriction" }
```

The shorthand is typed (`BareAddonKind`): only kinds whose config is fully
optional accept it, so it can never drop a config a kind needs. Both forms may
be mixed in one list, and both declaration sites (`addons` and `tools`) take
`AddonEntry`, which is the union of the two. The wiring lives in `src/lib`, the addons themselves in `src/addons`,
so the second folder is the list of what actually exists:

| File                   | Role                                                     |
| ---------------------- | -------------------------------------------------------- |
| `lib/registry.ts`      | Kind, config and state channel types plus the kind -> entry lookup |
| `lib/AddonHost.tsx`    | Mounts the active route's addons                         |
| `lib/TargetAddonHost.tsx` | Mounts one addon declared on a stack entry            |
| `lib/target-addons.ts` | Trigger ids and the entry lookups the layer button needs |
| `lib/AddonStateContext.tsx` | Typed hooks over the shared addon state (see below) |
| `lib/addon-overrides.ts` | What the `addonManager` may switch on or off, applied by the host |
| `lib/addon-overrides-storage.ts` | Keeps those switch positions in `localStorage`, per route |

| Addon                       | Kind                                                     |
| --------------------------- | -------------------------------------------------------- |
| `addons/AddonManager/`      | switchboard for the addon system (see below)             |
| `addons/CameraRestriction.tsx` | whether the maplibre camera stays north-up and flat    |
| `addons/GazetteerSource.tsx` | extra source for the default gazetteer search           |
| `addons/GazetteerMode.tsx`  | extra mode in the gazetteer mode dropdown                |
| `addons/HomeOverride.tsx`   | moves the home button's target and tooltip for this route |
| `addons/VectorHighlight.tsx` | highlight/dim mode for the maplibre map                 |
| `addons/LayerVisibility.tsx` | per-member visibility toggles for a group               |
| `addons/LibreTerrain.tsx`   | terrain toggle button for the maplibre map              |

An addon that needs more than one file gets its own folder there
(`addons/CameraTour/index.tsx` plus its parts).

## The two declaration sites

The same registry serves both. Where a kind is declared is what decides how it is
mounted and what it acts on; there is no `scope` field.

| Declared on                             | Mounted by         | `target` | Lifetime                        |
| --------------------------------------- | ------------------ | -------- | ------------------------------- |
| a route's `addons: AddonEntry[]`        | `AddonHost`        | `null`   | the whole route                 |
| a stack entry's `tools: AddonEntry[]`   | `TargetAddonHost`  | that entry | while the entry is in the stack |

A kind that needs a target guards on it rather than assuming one, which is also what
lets one kind serve both sites.

### Route addons

1. A route config declares `addons: AddonEntry[]`. In the geoportal that is
   `FachzwillingRoute` (see
   `apps/geoportal/src/app/constants/fachzwillinge/index.ts`).
2. `main.tsx` resolves the active route and passes its addons to `App`, which
   hands them to `CarmaMapProviderWrapper`. The wrapper mounts `AddonProvider`
   (from `@carma-mapping/contexts`), which provides the list and the shared
   addon state to the whole tree; that is the only place the list is passed.
3. `MapWrapper` renders a bare `<AddonHost />` **inside `ControlLayout`**. The
   host reads the list from the provider, looks each addon's `kind` up in
   `addonRegistry` and mounts the component with the shared interaction props.
4. When the user navigates to another route, the host unmounts the components;
   an addon's entire lifecycle is its mount time, cleanup belongs in its effect
   teardowns. The shared addon state is scoped the same way (see below).

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

| Entry                        | Clicking the trigger     | Renders                                |
| ---------------------------- | ------------------------ | -------------------------------------- |
| `trigger` with `onClick`     | runs the action at once  | nothing; the kind needs no `Component` |
| `trigger` without `onClick`  | toggles the kind's panel | `Component`, in the interaction view   |
| no `trigger`                 | (nothing to click)       | `Component`, mounted by the addon host, wherever it renders, including `<Control>` |

Because each entry has exactly one mount point, a tool with a trigger is never also
mounted headlessly.

**Map UI needs nothing from the registry.** `Control` from
`@carma-mapping/map-controls-layout` registers its children with the layout rather
than rendering them in place, so any addon may position itself on the map:

```tsx
export const SomeKind = ({ config }: AddonComponentProps<"someKind">) => (
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

## Taking a decision over from the app

An addon that should change how the app's own map behaves does not ask the app
for a hook. It overrides the decision where the map engine keeps it, and the
app keeps passing its own props unchanged.

`cameraRestriction` is the worked example. `@carma-mapping/engines/maplibre`
keeps the camera restriction per map instance, with the app's props as the base
and `setCameraRestrictionOverride(map, value | null)` as an override on top:

```tsx
useEffect(() => {
  if (!libreMap) {
    return;
  }
  setCameraRestrictionOverride(libreMap, { restricted, maxPitch });
  return () => {
    setCameraRestrictionOverride(libreMap, null);
  };
}, [libreMap, restricted, maxPitch]);
```

The engine applies the effective value and publishes it, so map controls read
what is true (`useCameraRestriction(map)`) instead of re-deriving it from the
app's config, and the unmount cleanup hands the decision back on a route switch.
A base the app marked as forced cannot be overridden, which is how app modes
that depend on a locked camera (print) stay safe from route configuration.

Use this shape rather than an addon-state channel whenever the consumer is the
app or the engine; channels are for addons talking to each other.

`homeOverride` is the same shape one level up: the decision (where the home
button leads) is not the engine's but the app's, so the override lives in
`@carma-mapping/engines-interop/view-state` and the addon sets it through the
public api instead of importing the store:

```tsx
useEffect(() => {
  carma.mapping.setHomeOverride({ lat, lng, zoom, tooltip });
  return () => {
    carma.mapping.setHomeOverride(null);
  };
}, [carma, lat, lng, zoom, tooltip]);
```

The bridge in `@carma-mapping/portals` implements `setHomeOverride` by writing
the override store; the app's home button reads it with `useHomeViewOverride()`
and merges it over its own home view, so fields the caller omits stay the app's.
That keeps the addon free of app imports and the app free of addon imports.

## Shared addon state

Addons are isolated by default: each gets its props and shares nothing with its
siblings. The shared addon state is the opt-in way for them to cooperate; the
intended split is a headless addon that analyzes the map and writes what it
found, and UI addons that read it and display it.

```tsx
const [mapInsights, setMapInsights] = useAddonState("mapInsights");
```

**Channels are typed.** `AddonStateMap` in `registry.ts` declares one key per
channel, the same one-line cost `AddonConfigMap` asks for a config; the value
type of `useAddonState(key)` and its setter is inferred from the key. The
setter accepts a value or a functional update (React's `useState` contract,
including the caveat for function-valued channels) and bails out on
`Object.is`-equal writes.

**The provider comes with the framework.** `CarmaMapProviderWrapper` mounts
`AddonProvider` and hands it the route's addons; apps wire nothing. The
provider and its contexts are a generic, string-keyed core living in
`@carma-mapping/contexts`, because portals must not depend on this library
(`portals -> addons -> fuzzy-search -> portals` would be circular); this
library's `lib/AddonStateContext.tsx` is the typed surface over that core and
the only import addon authors need. Rendering without a provider is not an
error: reads see an empty snapshot, writes are dropped with a dev hint.

**State is scoped to the route.** The provider keys its state on the `addons`
identity, so switching routes starts from an empty map and one route's addons
never see another's values. Route configs are static module objects, which is
what makes that identity stable; a route building its list inline can pass an
explicit `scopeKey` to the provider instead.

**Producers and consumers declare their channels.** A registry entry names the
channels it writes (`provides`) and reads (`requires`):

```ts
export const addonRegistry = {
  // ...
  mapInsightsSource: { Component: MapInsightsSource, provides: ["mapInsights"] },
  mapInsightsPanel: { Component: MapInsightsPanel, requires: ["mapInsights"] },
};
```

`AddonHost` checks the route's list in dev and warns when a `requires` is not
covered by any sibling's `provides`, so a consumer configured without its
producer surfaces in the console instead of as a silently empty panel.

## The addon manager

`addonManager` lists every kind in the registry with a switch per row, so a
route's setup can be inspected and changed while the map is running. Open it
with `Ctrl+Alt+A` (`Cmd+Alt+A` on mac) or, where the route enables the button
(`showControl`), with the puzzle piece in the map's control column. The
geoportal declares it in `DEFAULT_ADDONS` with the button off, so it is there in
every route without showing a debug button to visitors.

**The switches really mount and unmount.** They write the `addonOverrides`
channel, and `AddonHost` subtracts the suspended kinds from the route's list and
appends the switched-on ones before mounting. It is the one channel the host
itself reads rather than a sibling addon.

**The switch positions survive a reload.** The addon state map itself is
session-only, so the manager mirrors the channel into `localStorage`
(`lib/addon-overrides-storage.ts`) and seeds from there on the next load. One
entry per route, keyed by the sorted kinds the route declares, so a changed
route list starts from its own defaults instead of inheriting decisions about a
different set of addons. Only the on/off decision is stored, never a config: a
declared addon switched back on is mounted from its route entry again, with
exactly the config the route declares.

Three kinds of row cannot be switched, each with a tooltip saying why: the
manager itself (there would be no way back), trigger addons such as
`zoomToExtent`, which are mounted per layer by `TargetAddonHost` and not per
route, and undeclared kinds whose config is required, since there is nothing to
mount them with. A caged kind in a build without cage is none of those: it is a
route addon like any other and stays switchable, the row just says "nicht im
Build" because there is no component behind the switch. The last set is `SWITCHABLE_KINDS` in `lib/addon-overrides.ts`,
typed `readonly BareAddonKind[]`, so listing a kind that needs a config there is
a compile error.

A minimal producer is an effect that publishes, a minimal consumer a component
that reads:

```tsx
export const MapInsightsSource = ({
  libreMap,
}: AddonComponentProps<"mapInsightsSource">) => {
  const [, setMapInsights] = useAddonState("mapInsights");
  useEffect(() => {
    if (!libreMap) {
      return;
    }
    const publish = () => setMapInsights(analyze(libreMap));
    publish();
    libreMap.on("moveend", publish);
    return () => {
      libreMap.off("moveend", publish);
    };
  }, [libreMap, setMapInsights]);
  return null;
};

export const MapInsightsPanel = (
  _props: AddonComponentProps<"mapInsightsPanel">
) => {
  const [mapInsights] = useAddonState("mapInsights");
  return mapInsights ? <Readout {...mapInsights} /> : null;
};
```

`useAddonState` subscribes per component, so a producer that only writes does
not re-render on state changes. `useAddonStateSnapshot()` returns the whole
channel map at once for callers outside the addon components (the layer-button
trigger path, once it derives from state); addons themselves should read
single channels.

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

Create the component in `src/addons` (one file per kind, or a folder per kind if
it needs several) and export it from `src/index.ts`. It receives
`AddonComponentProps<"yourKind">` and typically renders `null`; it interacts
with the app through its props:

```tsx
import { useEffect } from "react";
import type { AddonComponentProps } from "../lib/registry";

export const CameraTour = ({
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

`GazetteerMode` is the canonical example of an addon that extends the
app through the carma api; `addMode`/`addSource` return their remover,
so the registration is exactly one effect:

```tsx
export const GazetteerMode = ({
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
import { CameraTour } from "../addons/CameraTour";

export const addonRegistry: {
  [K in AddonKind]: AddonRegistryEntry<K>;
} = {
  gazetteerSource: { Component: GazetteerSource },
  gazetteerMode: { Component: GazetteerMode },
  cameraTour: { Component: CameraTour },
};
```

The entry is a record rather than the component alone so a kind can declare metadata
the host needs before the component renders.

### 4. Optionally, opt in to a trigger

A kind that should be opened from a stack entry adds `trigger`: an icon the
entry's layer button renders next to its title. The component then renders as
that trigger's panel:

```ts
export const cameraTourTrigger: AddonTrigger<"cameraTour"> = {
  icon: faVideo,
  label: ({ config }) => config?.buttonLabel ?? "Kameratour",
  // optional count on the trigger
  badge: ({ target }) => stops(target).length,
  // no trigger when this target cannot support the kind
  isApplicable: ({ target }) => stops(target).length > 0,
};
```

`label`, `badge` and `isApplicable` receive `{ config, target }`, so the trigger can
reflect the entry it belongs to. `isApplicable` returning false hides the trigger
entirely, which is also what makes a target-dependent kind harmless if it is ever
declared on a route, where `target` is `null`.

**Action kinds: do the thing on click, open nothing.** Add `onClick` and the trigger
behaves like the measurement layer's layerbar actions rather than a panel toggle. The
kind then needs no `Component`, and its entry is just the trigger:

```ts
export const zoomToTrigger: AddonTrigger<"zoomTo"> = {
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
  zoomTo: { trigger: zoomToTrigger },
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
    // kinds whose config is optional: the bare kind asks for their defaults
    "vectorHighlight",
  ],
};
```

On a workflow, in the same route file's `perspectives`, with the same two forms:

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

Each declared tool with a `trigger` gets its own icon in the group's layer
button, in declaration order. Opening one closes the others.

That is all; there is no further wiring.


## Guidelines

- One component per addon kind, in its own file (or folder) in `src/addons`,
  named after the kind and without an `Addon` suffix.
- Addon components must render `null` or self-contained UI; they must not
  assume anything about the surrounding layout.
- Register api-based extensions (gazetteer modes, layers, ...) in `useEffect`
  and return the remover as the cleanup, so route switches cleanly undo them.
