# Routing addon: plan

## Goal

A `routing` addon that takes a route from another addon (today: the route of
the feature picked in "In der Nähe", later: anything that produces a route) and
puts the user on it when asked: the map eases to the start of the route, zooms
in, tilts a little and rotates so the route runs "up" the screen. Asked, not
automatic: picking a feature shows it in the info box as before, and a button
there starts the navigation. Nothing else for now: no turn list, no following
the user along the route, no route of the addon's own.

## Two channels

### `activeRoute`: the route in focus

The nearest-feature addon holds the driven lines (`drawnRoutes`) and knows
which one is picked (derived from `MapSelectionContext`). It publishes that one:

```ts
// libraries/mapping/addons/src/addons/Routing/routeChannel.ts
export type ActiveRoute = {
  /** who published it, e.g. "nearestFeature"; for dev tools and later UI */
  source: string;
  /** the line from start to destination, `[lng, lat]` in WGS84 */
  coordinates: [number, number][];
  /** what the destination is called, when the producer knows */
  label?: string;
};

export type ActiveRouteState = { route: ActiveRoute | null };
export const useActiveRoute = (): [ActiveRoute | null, (route: ActiveRoute | null) => void];
```

Only the *picked* route, never the whole ranking, and `null` when nothing is
picked. Leaving the stage clears the selection, so the channel empties with it.
Registry: `nearestFeature` gets `provides: ["activeRoute"]`.

Nothing moves the camera on this channel. It only says "there is a route for
what you are looking at", which is what makes the button appear.

### `routeNavigation`: the offer to go, and whether we are going

Published by the `routing` addon while it is mounted:

```ts
export type RouteNavigation = {
  /** the camera is on the route right now */
  navigating: boolean;
  /** ease the camera onto the route in focus; no-op without one */
  start: () => void;
  stop: () => void;
};

export type RouteNavigationState = { navigation: RouteNavigation | null };
export const useRouteNavigation = (): RouteNavigation | null;
```

`start` does the flight and sets `navigating`; `stop` clears it. When the route
in focus changes or goes away, navigation ends on its own: it belonged to the
old route, and the user presses the button again for the next feature.

Registry: `routing: { Component: Routing, requires: ["activeRoute"], provides: ["routeNavigation"] }`.

## The `routing` addon

`libraries/mapping/addons/src/addons/Routing/`:

| File              | Role                                                       |
| ----------------- | ---------------------------------------------------------- |
| `Routing.tsx`     | the addon: reads `activeRoute`, publishes `routeNavigation` |
| `routeChannel.ts` | both channel types and hooks                               |
| `routeCamera.ts`  | start point and bearing of a route (pure)                  |
| `config.ts`       | `RoutingConfig` and defaults                               |
| `index.ts`        | barrel                                                     |

Headless, `return null`, MapLibre only (no-op without `libreMap`).

**What `start` does:**

1. `start = coordinates[0]`. The route's start *is* the current location: the
   origin search publishes the user's own position as the default origin, and
   the nearest-feature ranking drives from it. So no second geolocation call
   and no dependency on `LocateContext`; a route from a picked address starts
   at that address, which is also right.
2. `bearing` = direction from `start` to the point `lookAheadMeters` along the
   line (`@turf/turf` `along` + `bearing`). Looking a bit ahead rather than at
   the second vertex keeps a short first segment (a driveway) from pointing
   the map sideways.
3. `map.easeTo({ center: start, zoom, bearing, pitch, duration })`.

**Config** (all optional, so the bare kind `"routing"` works):

```ts
export type RoutingConfig = {
  /** zoom the map goes to at the start of the route; default 17 */
  zoom?: number;
  /** camera tilt in degrees; default 30, 0 is flat */
  pitch?: number;
  /** how far along the route the bearing looks; default 100 m */
  lookAheadMeters?: number;
  /** ease duration in ms; default 1200 */
  duration?: number;
};
```

## The button in the info box

The app must not import the addons library to show it, so the button goes
through the public api, the `homeOverride` / gazetteer shape:

- `@carma-api`: `carma.ui.addInfoBoxAction({ key, tooltip, icon | iconname, active?, onClick })`
  returns its remover. `InfoBoxAction` is a plain type, icon typed `unknown`
  (carma-api is dependency-free).
- portals: `lib/components/info-box-actions.ts`, a module store like the home
  view override (`addInfoBoxAction`, `useInfoBoxActions`), wired into the
  `ui` adapter by the bridge's `useUiAdapter`; `getInfoBoxActionLinks` in
  `helper.tsx` turns the actions into `CarmaIconLink`s, blue while `active`.
- geoportal `FeatureInfoBox.tsx`: `links.push(...getInfoBoxActionLinks(useInfoBoxActions()))`
  after its own links. It knows no addon.
- the routing addon registers its action while a route is in focus and
  re-registers it under the same key when `navigating` flips: "Route anzeigen"
  calls `start`, "Navigation beenden" calls `stop`.

The button is not shown for a feature clicked directly on the map: there is no
route in focus for it. Fetching one from the origin is a later step.

## Rotation and the camera restriction

`applyCameraRestriction` calls `map.setBearing(0)` and disables rotation while
restricted, and the geoportal's default is `cameraRestriction` with
`unless3dLayersActive`, i.e. locked in 2D. A rotated camera is therefore only
possible when the restriction is lifted, and the routing addon should not
fight the restriction addon over the one override slot.

Chosen: **one new mode on `cameraRestriction`**, `"unlessNavigating"`. It
reads `routeNavigation` and unlocks while `navigating` is true. Pressing the
button unlocks and turns the map; stopping, or the route going away, re-locks
it and the map snaps back north-up.

A route declares both:

```ts
addons: [
  { kind: "cameraRestriction", config: { mode: "unlessNavigating" } },
  "routing",
  // ...nearestFeature, its categories, originSearch
]
```

Not chosen: the routing addon writing its own override. Two addons writing the
same slot means last writer wins, and which one that is depends on effect
ordering.

## Files touched

| File                                                          | Change                                              |
| ------------------------------------------------------------- | --------------------------------------------------- |
| `libraries/mapping/addons/src/addons/Routing/*`               | new (five files above)                              |
| `libraries/mapping/addons/src/lib/registry.ts`                | `routing` kind + config, both channels, entries     |
| `libraries/mapping/addons/src/lib/addon-overrides.ts`         | `routing` switchable in the addon manager           |
| `libraries/mapping/addons/src/index.ts`                       | exports                                             |
| `libraries/mapping/addons/src/addons/NearestFeature/NearestFeature.tsx` | publish the picked route                  |
| `libraries/mapping/addons/src/addons/CameraRestriction.tsx`   | mode `unlessNavigating`                             |
| `libraries/mapping/addons/README.md`                          | table rows + a short "Routing" section              |
| `libraries/carma-api/src/lib/ui.ts`, `index.ts`, `README.md`  | `InfoBoxAction`, `addInfoBoxAction`                 |
| `libraries/appframeworks/portals/.../info-box-actions.ts`     | new: the store and `useInfoBoxActions`              |
| `libraries/appframeworks/portals/.../helper.tsx`              | `getInfoBoxActionLinks`                             |
| `libraries/appframeworks/portals/.../carma-api-bridge/useUiAdapter.ts` | wires the store into `carma.ui`            |
| `apps/geoportal/src/app/components/feature-info/FeatureInfoBox.tsx` | renders the contributed actions               |
| `apps/geoportal/src/app/constants/fachzwillinge/addons.ts`    | declare `routing` and the restriction mode          |

## Check list after implementation

On `#/addons` with the MapLibre map:

1. Search "In der Nähe" > "Apotheken", pick a row: info box opens as before,
   map does not move beyond the ranking's fit; a route button is in the box.
2. Press it: map eases to the origin at zoom 17, tilted, the blue route leading
   upward; the button turns blue.
3. Press it again: camera re-locks and snaps to north-up.
4. Navigate, then pick another row: navigation ends, map snaps north, the new
   feature's box shows the button again, not pressed.
5. Click the ✕ in the search: button gone, camera locked.
6. Click a plain feature on the map outside the ranking: no route button.
7. `Ctrl+Alt+A`, switch `routing` off: no button; routes still draw.

## Decisions

- Navigation starts from a button in the info box, not on pick.
- Camera restriction via the new `unlessNavigating` mode.
- Default pitch is a little tilt: 30 degrees.
- No button for a plain feature click yet.
- The origin search's marker and the locate dot are untouched.
