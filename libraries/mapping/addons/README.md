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
| `lib/stackedSources.ts` | Finds the layer stack's sources and where each one's tile set lives |
| `lib/featureIndex.ts` | Ranks features against the tilesets' `features.json` (see below) |

| Addon                       | Kind                                                     |
| --------------------------- | -------------------------------------------------------- |
| `addons/AddonManager/`      | switchboard for the addon system (see below)             |
| `addons/CameraRestriction.tsx` | whether the maplibre camera stays north-up and flat    |
| `addons/GazetteerSource.tsx` | extra source for the default gazetteer search           |
| `addons/GazetteerMode.tsx`  | extra mode in the gazetteer mode dropdown                |
| `addons/HomeOverride.tsx`   | moves the home button's target and tooltip for this route |
| `addons/NearestFeature/`    | "In der Nähe" mode in the search bar: pick a category, get the nearest ones |
| `addons/NearestFeature/categories/` | one addon per category the mode offers ("Apotheken") |
| `addons/OriginSearch/`      | the "von wo?" search: where the user starts from (see below) |
| `addons/VectorHighlight.tsx` | highlight/dim mode for the maplibre map                 |
| `addons/LayerVisibility.tsx` | per-member visibility toggles for a group               |
| `addons/LibreTerrain.tsx`    | terrain toggle button for the maplibre map                       |
| `addons/ShadowSimulation/`   | daylight-clamped sun control for MapLibre and Three.js content   |

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

What the four UI surfaces of a map app look like, and which of them an addon may
put its own UI on, is [`ADDON-UI.md`](./ADDON-UI.md). This section is only about
the mount point the registry decides.

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
shared entry (`ADDON_OVERRIDES_STORAGE_KEY`), because the stored state names
kinds rather than positions in a list: editing a route's addons keeps every
switch position, and a newly declared kind is in neither list and therefore
mounts. A route that wants its own set names it on the manager entry,
`{ kind: "addonManager", config: { storageKey: "carma::addonOverrides::demo" } }`.
Only the on/off decision is stored, never a config: a declared addon switched
back on is mounted from its route entry again, with exactly the config the route
declares.

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


## Simulating a build without cage

Some addons are implemented in the closed-source cage repo and reached through
`lib/caged-addons.ts`, which yields `undefined` for each of them when cage is
not in the checkout. Every consumer therefore has a fallback, and a developer
with cage linked in never sees one.

`#/<route>?ff=nocage` makes this checkout behave like one without cage: the cage
badge disappears and `useCreateBlendLayer` yields nothing, so `timeSlider` drops
to its tiled WMS layer and snaps to whole steps. Branch on `useIsCagedAvailable`
or `useCreateBlendLayer` rather than on the raw module exports, or the addon
will not follow the flag.

The flag is a simulation, not the real thing: the registry still holds the caged
components, so the addon manager keeps listing them as implemented, and cage's
own code is still in the bundle. For the ground truth, run
`099-cage/unlinkingHotlinkForDeveloping.sh` and restart the dev server.
## How "what is nearest" is answered

`nearestFeature` ranks against `lib/featureIndex.ts`: no tiles are read, no
geometry is compared, and a search costs no requests at all.

| | `lib/featureIndex.ts` |
| --- | --- |
| reads | the tileset's `features.json`, once per tileset |
| ranks by | the feature's bounding box |
| completeness | the whole layer, always |
| cost per search | none |
| needs | the pipeline's `FEATURE_INDEX=true` for that layer |

`features.json` is what the tiling pipeline's `buildFeatureIndex.js` writes next
to `metadata.json`: one id, one source-layer and one bounding box per feature,
about 25 bytes each, columnar. One request per tileset, none per search.

It carries no properties, which is why the names are read back off the drawn
features (see below); writing a hit's attributes into the index itself is
`docs/features-json-generic.md`. Tiles that MapLibre fetches to *draw* the layer
are unrelated and unaffected by any of this.

Picking a row **clicks the hit on the map**, where it is drawn, so the host app
answers with the info box it shows for any other click on that feature; see
"Picking a hit" below.

The box is why this scales to a source that could never be read as tiles, such
as ALKIS with its 512k features and tens of megabytes per low-zoom tile: it is an
exact answer for a point layer and a lower bound for everything else, so a
feature can be ranked slightly too high but never too low, and a point inside a
parcel still scores zero. A source whose tileset publishes no index drops out of
the ranking entirely and is reported in the result's `statuses`.

## The mode it puts that in: "In der Nähe"

`nearestFeature` is a **dynamic gazetteer mode**: where `gazetteerMode` declares
`sources` that are preloaded and fuzzy searched, this one declares a
`resolve(input)` that answers every input itself, because its entries depend on
the map rather than on a file. Everything else about a mode (label, icon,
placeholder, the Esc-Esc cycle) is unchanged, and the contract lives in
`@carma-mapping/fuzzy-search` (`DynamicSearchGroup` / `DynamicSearchOption`):
rows are plain data (`label`, `detail`, `hint`, `drilldown`, `item`, `onPick`),
so every dynamic mode reads the same in the dropdown.

The mode has two stages, like the land-parcel search. The first lists the
published categories; picking one drills down into the nearest features of that
category, with what it takes to drive there on the right. A dynamic drilldown closes the
dropdown while the next stage is being resolved: it may take a while, and a
dropdown still showing the stage that was just picked reads as if nothing
happened, so the input's spinner is the only thing running and the answer opens
it again. Picking a result runs its `onPick`, which clicks that feature on the
map rather than handing it to the search: the map has already been fitted to all
hits, and the index carries a bounding box rather than the position a gazetteer
marker would need. A dynamic mode that does want the map to travel sets `item`
instead.

Getting back out of a stage is the button left of the input, which is the mode
picker while the input is empty and a **✕** while a dynamic mode has anything in
it: it empties the input, asks the mode again with nothing in it and opens the
dropdown on the answer, so going from "Apotheken" to "Krankenhäuser" is one
click and a pick. The search does no more than that; a mode is asked with an
empty input whether the ✕ did it or the user did, so what a mode put on the map
it takes back on its own. `NearestFeature` does it in `resetRun`: the drawn
routes go, the selection is cleared and the run is forgotten, by the ✕, by the
input being emptied by hand and by the mode being left, so no way back leaves
the map in a different state than another.

Picking a category runs one sequence, every time the stage is entered; nothing
is cached between searches. Only the rows of the run that just happened are held
on to, so typing after that filters what is already there instead of re-ranking
and moving the map per keystroke:

1. **the layer is put on the map** when it is not on it
   (`carma.mapping2D.hasLayer` / `addLayer`), then the style is waited for,
   because the ranking only sees sources the style actually has;
2. **the ranking** (`collectNearestFromIndex`, narrowed to that layer through
   its new `filter` option);
3. **the candidates are driven to** (`carRanking.ts`), which is what puts them
   in the order the user sees;
4. **the map is fitted** to the origin and every hit;
5. **the names are read off the drawn features** with `queryRenderedFeatures`;
6. **the map is fitted again**, now around the driven lines as well.

Step 5 is why step 4 exists: `features.json` carries no properties, so the names
have to come from the tiles, and a feature is only queryable once it is drawn.
It is also why step 6 is a second fit rather than a wider first one: a route
that swings out of town would zoom the map far enough out for the hits to stop
being drawn, and their names would go with them.
Which properties make a label is configured per category (`labelProperties`,
`detailProperties`), because every layer names things differently;
`"<Kategorie> #<id>"` is the fallback.

### Nearest by car, and the routes on the map

`features.json` can only measure as the crow flies, which is what makes it free.
That is a good *candidate* set and a poor order: a river or a valley puts the
nearest pharmacy on the map twenty minutes away by car. So the straight-line
hits stay the shortlist and each one is driven to once, in parallel, through
`fetchCarRoute` of `@carma-mapping/routing` (MOTIS, `CAR` as the only direct
mode). That is `count` requests per ranking, and the reason it is not done over
the whole layer. A hit the service cannot answer for keeps its place at the end
of the list with its straight-line distance: it is still one of the nearest, it
is only unknown how long it takes to get there. `carRouteRanking: false` turns
all of it off, and the rows read as they did before.

The driven lines are then drawn (`routeLayer.ts`), which is what makes "twelve
minutes" mean something: one geojson source, a white casing, the routes in grey,
and the picked one in blue on top. Which one is picked is not state of its own,
it is read from the selection: a click on a line picks the hit at its end,
exactly as picking that hit's row does, so the list and the map cannot disagree.
The lines are marked `carmaConf.nonSelectable`, so every click path in the
engine walks past them and what lies under a line stays clickable through it.

### Picking a hit

Selecting a feature through `MapSelectionContext` highlights it and no more. The
info box belongs to the host app, and every host builds it from its own click
handling: the geoportal runs `onSelectionChanged` over the hits of a click and
queries its WMS layers at the clicked position (it runs `LibreMap` with
`disableInternalSelection`). None of that can be reached by naming a feature, so
`pickHit.ts` clicks the feature where the map draws it and the host answers as
it does for any other click, with the right info box for the right layer.

The click is not fired blind at the middle of the bounding box: the middle of a
bent street is not on it, and a symbol sits above its own coordinate. The point
is searched for instead, over a small ring around the middle, and the click goes
to the first one at which the map actually draws this feature. When there is
none the hit is off screen, and picking falls back to `selectFeature()` on
`MapSelectionContext`: highlighted, without an info box, which is what picking a
row did before.

A click on a route line is taken off the DOM on its way down to the map, and not
from the map. A click on a route means "pick the hit at its end", so the map
must not also handle it as a click on the spot the line happens to run through:
the host would put its info box, its marker and its queries there, and the pick
that follows a moment later would race it. Only a click that lands on a line is
taken this way; every other one reaches the map untouched.

Matching a hit back to a catalog layer needs the engine's second stamp:
`metadata["layer-id"]` is the style's own name for the layer (the slugified
style URL, or the built id), so both style paths — `styleBuilder` for the
`merged` layer mode, which is what the geoportal runs, and `styleComposer` for
the `imperative` one — also write `metadata["carma-layer-id"]`, the id the layer
apis speak. `StackedSource` carries it as `carmaLayerId`.

Where "nearby" is measured from is not the mode's own business either: it reads
the `originLocation` channel, which the `originSearch` addon below writes, and
falls back to its `origin` config when nothing published one (the geoportal
route passes its own `DEFAULT_HOME_VIEW_REF` there, so the app's config stays
the source of truth for a route without that addon).

A new starting point re-ranks the category on screen: the routes and the
selection go with the point they were measured from, and the fresh rows are
pushed into the open dropdown. That re-rank hangs on the stage itself
(`stageCategoryRef`, `rankedOriginKeyRef`), not on the last run, because a
starting point can change twice in a row: clearing the origin input publishes
the user's own position, so the second change has to find a stage to re-rank
while the first one's ranking is still in flight. The fallback above is why the
origin input hands the fix back itself rather than publishing nothing and
letting an effect fill it in a render later: for that render the channel is
empty, and a consumer reading it measures from its own default instead, which
is neither the address that was cleared nor the position it is going back to.

### A category is an addon of its own

The mode declares no categories. Each one is a headless addon that publishes
its **name, icon and layer** on the `nearestFeatureCategories` channel and
renders nothing:

```ts
addons: [
  { kind: "nearestFeature", config: { origin } },
  "nearestFeatureApotheken",
  "nearestFeatureBahnhoefe",
  "nearestFeatureKrankenhaeuser",
]
```

So a route mixes and matches the categories it wants, the addon manager can
switch one off without touching the mode, and a new category is a copy of
`categories/Apotheken.tsx` with another definition, plus its kind in the
registry.

A category whose layer does **not** own its tileset names its own index with
`featureIndexUrl`. The ranking otherwise reads the `features.json` of the
directory the tiles come from, which is the whole tileset: right for a layer
tiled on its own (`Apotheken`), wrong for the POI tiles, where every kind of
place is drawn from one tileset and one source-layer by a filter, and each kind
has its own index file next to the tiles (`Bahnhöfe`). The channel is a **record keyed per category** rather than a list,
because several producers write it side by side: `useNearestFeatureCategory`
merges its own key in and takes it out again when it unmounts, so nobody
overwrites a sibling. The mode reads the channel through a ref, so a category
mounting later does not re-register the mode.

A row may carry its own icon (`DynamicSearchOption.icon`), which is how a
category's icon reaches the first stage; without one a row shows the mode's
icon. The hits of the second stage pass `icon: null` and show none at all: they
are all the same kind of place, which the stage's title already says, so the
column would be that one icon five times over and the names are short of the
width it takes.

The addon's folder is split along those steps:

| File | |
| --- | --- |
| `NearestFeature.tsx` | the addon: config defaults, the mode's `resolve`, registration |
| `config.ts` | the mode's own config type and every default |
| `categoryChannel.ts` | the category type, the channel and the publishing hook |
| `categories/Apotheken.tsx` | one category: name, icon, layer, label properties |
| `categories/Bahnhoefe.tsx` | the same, for a layer sharing the POI tileset: it names its own index |
| `categories/Krankenhaeuser.tsx` | another POI category, same shape as `Bahnhoefe` |
| `categoryInput.ts` | the `"Apotheken: "` input grammar and the first stage |
| `rankCategory.ts` | the second stage: add layer, rank, drive, fit, build the rows |
| `carRanking.ts` | driving to the candidates and ordering them by how long it takes |
| `routeLayer.ts` | the routes on the map: drawing them, the blue one, clicking one |
| `pickHit.ts` | picking a hit by clicking it where the map draws it |
| `mapReady.ts` | waiting for the style to carry the layer, and for `idle` |
| `featureProperties.ts` | reading the hits' names off the drawn features |

## The other half of the pair: „von wo?“

The app's own search says where to go. `originSearch` is the second input that
says where the journey starts, and it is deliberately not part of "In der
Nähe": the same pair is what a routing UI is built from, so the origin is a
channel and an addon of its own, and the nearest-feature mode is just its first
consumer.

```ts
addons: [
  { kind: "nearestFeature", config: { origin } },
  "nearestFeatureApotheken",
  "originSearch",
]
```

The channel, `originLocation`:

```ts
type OriginLocationState = {
  /** the current starting point; null until something publishes one */
  origin: { lat: number; lng: number; label: string } | null;
  /** who wants the origin input on screen right now: key -> why */
  requests: Record<string, string>;
};
```

`requests` is what keeps a second search box out of the way until it is worth
having. A consumer registers its key while it wants an origin
(`useOriginRequest`) and drops it again when it unmounts: "In der Nähe" does so
once it has actually ranked a category, so the input appears with the first
result rather than next to an empty map. `alwaysVisible` overrides that for a
route that wants it from the start. A record rather than a counter, so several
consumers ask side by side.

The input itself is an ordinary `LibFuzzySearch`, so any address the gazetteer
knows can be the starting point, with two differences from the app's own:

- `disableAdditionalModes` (new) keeps it to the built-in gazetteer. Without it
  the origin input would offer the modes addons contributed, "In der Nähe"
  among them, which is the very mode reading what this one publishes.
- it passes its own `onSelection`, so no `SelectionItem` is set: picking a
  starting point sets no gazetteer selection and does not move the map, and the
  view stays where the destination search put it. The hit's coordinates are
  converted to WGS84 by its own crs before they go on the channel.

Its width is `100%` rather than a number of pixels, which is what makes it as
wide as that search on every screen: the bottom-left control column is as wide
as its widest child and aligns them to its **right** edge (`control-styles.ts`),
so a fixed 300px sat indented under a search that spans the whole width of a
phone. `pixelwidth` still overrides it for a route that wants its own.

It also sits apart from that search rather than flush under it: a gap above it,
and a fixed "Von:" label inside the field (`inputPrefix`, a new `LibFuzzySearch`
prop) in front of whatever is typed there, so the input says on its own that it
is where the search starts rather than a second place to go to. With something
in the input the label is drawn over the field and the value and caret are moved
past its measured width; with nothing in it the label goes into the placeholder
text instead, which ant lays out itself, so the two states line up rather than
fight ant's own positioning. The label carries the "Von", so the placeholder is
the current origin's name alone;
`placeholderPrefix` puts something in front of it again for a route that wants
it.

While the input is there it owns the origin, so a consumer reads one value
instead of falling back to a default of its own. It
also carries the origin's marker (`originMarker.ts`), a MapLibre marker of its
own rather than the gazetteer's, added while the input is on screen and moved
with every new starting point, so the point everything measures from is visible.

### Where it starts: the user's own position

The starting point the input publishes on its own is **where the user is**, and
it does not ask the device for that itself: it switches on **the map's own
location mode**, the one behind the mobile locate button, and takes its
position as „Mein Standort“.

That mode used to be a hook each caller ran for itself
(`useLibreMapLocateControl`), which meant a `watchPosition` and a blue dot per
caller, and a button showing as off while another caller had it running. It is
now `LocateContext` in `@carma-mapping/contexts`, rendered by
`LibreContextProvider` with its own map, so the button, `FeatureInfobox`'s
routing and this input share one instance and no app mounts anything:

```ts
const { currentPosition, problem, activate } = useLocate();
activate({ fly: false }); // on, without moving the map
```

- **on demand, not at mount**, so a route where nothing asks for an origin never
  puts a permission prompt in front of the user. "In der Nähe" asks for the
  input when a ranking *starts*, so the prompt lands right after the user picked
  "Apotheken in der Nähe", which is a moment they understand.
- **`fly: false`.** The mode normally flies to the position at zoom 16, which is
  right for the button and wrong here: the ranking fits the map to its hits a
  moment later, and two moves read as the map being yanked about. The flag
  belongs to the activation, not to the mode.
- **the first fix, then held.** The mode keeps watching, but the origin is only
  published while the channel carries none, so "In der Nähe" does not re-rank
  and re-fit every few meters the user walks. Clearing the input is what takes
  a fresh fix.
- **a pin is a place, the dot is you.** While the origin is the user,
  `originMarker` stays off the map, because the location mode already draws them
  there; a picked address gets MapLibre's default pin, the same one the
  gazetteer drops on a selection (`LibreMapSelectionContent`), rather than the
  blue dot it used to draw, which was a second way of reading the same thing.
- **something switched on has to be switchable off**: `LibreMapLocateControl`
  shows on a phone as before, and now also wherever the mode is running,
  whoever started it. The geoportal mounts it whenever the MapLibre map is on;
  it used to mount the Leaflet `RoutedMapLocateControl` there, which drives
  Leaflet's own locate and could not show this mode's state at all.
- **declined or unavailable publishes nothing, and says so.** The channel stays
  empty, the user says where to start rather than being measured from a point
  they never chose, and they are told why: an antd `message.warning` plus
  „Standort unbekannt: Startpunkt suchen“ in the placeholder, which is what is
  still there once the toast has faded. The wording follows what went wrong
  (`LocateProblem`: `denied`, `unavailable`, `unsupported`), because a declined
  permission is the one the user can undo. The browser's own „User denied
  Geolocation“ goes to the console, where nobody is looking. What "In der Nähe"
  does meanwhile is its own `origin` config (Rathaus Wuppertal by default), so a
  ranking still works; it is the input that stays honest about not knowing.
- **`defaultOrigin` opts out**: a route that measures from a fixed point
  configures it, and the device is not asked at all. It has no built-in value
  any more, so leaving it unset is what asks for the own position.

### Waiting for the origin instead of ranking twice

Getting a position takes as long as the permission prompt is on screen, and a
ranking that does not wait for it runs from the fallback first and from the user
a moment later: the map flies to the Rathaus, fits itself around the pharmacies
there, and then does the whole thing again around the user. So the channel also
carries how far the question has got:

```ts
type OriginResolution = "absent" | "pending" | "settled";
```

`absent` is a route without the origin search, where a consumer uses its own
configured origin and waits for nothing. The input reports `pending` from mount
("there will be an origin") and `settled` once it has a position, a configured
origin, or a definitive no. `runRanking` awaits `settled` before it ranks, so
there is one ranking and one map fit. The waiters are released from an effect
rather than by polling, and again when the mode unmounts; a 15s backstop keeps
a search from hanging on an answer that never comes.

### Re-ranking on a new origin

A new starting point re-ranks the category that is on screen, and the mode does
that itself: picking an address in the origin search moves the focus there, so
waiting for the search to ask again would leave the map fitted around the old
point. The mode ranks, which re-fits the map, and only then tells the search.

Telling the search needs a push, because the search pulls: a mode answers
`resolve(input)` and cannot put rows into the dropdown. So a dynamic mode may
now hand the search a subscription:

```ts
/** ask the search to resolve an input again; returns an unsubscribe */
subscribe?: (
  rerun: (options?: { input?: string; open?: boolean }) => void
) => () => void;
```

`LibFuzzySearch` holds it while that mode is active and re-resolves when it is
called. "In der Nähe" passes both options: `input` puts the category's own stage
back into the field, off whatever hit was picked in it, and `open` shows the
result rather than leaving the user to open the dropdown after a pick that
happened in the other input. What was selected before belongs to the old
starting point, so the selection is cleared before the ranking runs. The rows
are already there when the search asks: the mode keeps the run it just did as
pending, and `resolve` takes it instead of ranking the same category twice. The mode object
stays identical (the callback lives in a ref), so nothing re-registers and no
gaz data is refetched. Every run carries the category and the origin it belongs
to, which is what tells "the same category from somewhere else" apart from "a
filter typed behind the same run".

| File | |
| --- | --- |
| `OriginSearch/originChannel.ts` | the channel, its type, the origin, request and resolution hooks |
| `OriginSearch/OriginSearch.tsx` | the input in its `<Control>`, the location mode, the hit conversion |
| `OriginSearch/originMarker.ts` | the gazetteer's own pin, for an origin that is a picked place |
| `OriginSearch/config.ts` | position, `defaultOrigin`, placeholders, warnings, `alwaysVisible` |
| `contexts/LocateContext.tsx` | the map's one location mode, shared with the locate button |

## Guidelines

- One component per addon kind, in its own file (or folder) in `src/addons`,
  named after the kind and without an `Addon` suffix.
- Addon components must render `null` or self-contained UI; they must not
  assume anything about the surrounding layout.
- Register api-based extensions (gazetteer modes, layers, ...) in `useEffect`
  and return the remover as the cleanup, so route switches cleanly undo them.
