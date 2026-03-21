# Consolidation Review: Scene State Infrastructure

## Current Inventory

### Two Redux Stores

| Store | Package | State Shape | Frame Sync |
|---|---|---|---|
| `ViewSyncStore` | view-sync | registrations, latestById, controllerId, target | None (event-driven) |
| `CesiumSceneStateStore` | cesium/react/scene-state | SerializedSceneState, error | scene.preRender every frame |

**Verdict:** Merge into one. ViewSync's purpose (controller arbitration + shared target)
and CesiumSceneState's purpose (camera snapshot) are the same concern: "what is the
current camera and who controls it." Two stores means two sources of truth.

### Four React Contexts

| Context | Package | Holds |
|---|---|---|
| `ViewSyncStoreContext` | view-sync | ViewSyncStore \| null |
| `ViewSyncReduxContext` | view-sync | Redux context for ViewSync selectors |
| `CesiumSceneStateStoreContext` | cesium/react/scene-state | CesiumSceneStateStore \| null |
| `CesiumSceneStateReduxContext` | cesium/react/scene-state | Redux context for scene state selectors |

**Verdict:** Collapse to two (one store context + one Redux context) or even one
if we use `useSyncExternalStore` instead of Redux for the simple case.

### Two Providers

| Provider | Package | Wraps |
|---|---|---|
| `ViewSyncProvider` | view-sync | ViewSync store + Redux |
| `CesiumSceneStateProvider` | cesium/react/scene-state | Scene state store + Redux |

**Verdict:** One provider. `<SceneStateProvider scene={...}>` creates the store,
manages frame sync, handles controller arbitration.

### 12+ Hooks

| Hook | Package | Purpose | Keep? |
|---|---|---|---|
| `useViewSyncStore()` | view-sync | Get ViewSync store | **Absorb** into scene state store |
| `useViewSyncSelector(fn)` | view-sync | Redux selector | **Absorb** |
| `useViewSyncState()` | view-sync | Full ViewSync state | **Remove** — use derived selectors |
| `useViewSyncTargetState()` | view-sync | Get target | **Rename** `useSceneState()` |
| `useViewSyncControllerId()` | view-sync | Get controller | **Keep** as `useSceneStateControllerId()` |
| `useRegisterViewSyncParticipant()` | view-sync | Register + control | **Keep** — core of multi-framework sync |
| `useCesiumSceneStateStore()` | scene-state | Get Cesium store | **Remove** — one store |
| `useCesiumSceneState()` | scene-state | SceneState snapshot | **Remove** — use `useSceneState()` |
| `useCesiumSceneStateOptional()` | scene-state | Nullable SceneState | **Remove** — `useSceneState()` already nullable |
| `useCesiumSceneStateErrorOptional()` | scene-state | Error | **Keep** as `useSceneStateError()` |
| `useInitialSceneViewState()` | scene-state | Hash → initial ViewState | **Keep** — needed for route load |
| `useCesiumSceneStateUpdateDriver()` | scene-state | External update trigger | **Review** — may not be needed |

**Target:** 5-6 hooks total.

### Snapshot & Serialization Types

| Type | Package | Fields | Keep? |
|---|---|---|---|
| `ViewState` | view-sync | lon,lat,alt,zoom,bearing,pitch,roll,range,fov*,cameraModel | **Keep** — derived hash-friendly projection |
| `SceneState` | cesium/scene-state | metadata, camera (SceneCamera), orbitPoint, lighting | **Replace** with CommonSceneState |
| `SceneCamera` | cesium/scene-state | worldPosition,worldDirection,worldUp,worldRight,worldQuaternion,cartographic,bearingRad,pitchRad,rollRad,matrices,cameraModel | **Remove** — redundant with CommonSceneState |
| `SerializedSceneState` | cesium/scene-state | metadata, camera (JsonSceneCamera), orbitPoint | **Remove** — no lossy serialization needed |
| `ObjectCentricCameraModel` | commons/camera/model | pose (anchor+bearing+pitch+range+matrices+quat), intrinsics | **Simplify** — CommonSceneState IS this |
| `ObjectCentricCameraPose` | commons/camera/model | anchor, bearing, pitch, roll, range, position, quaternion, matrices, basis | **Simplify** — split into stored (position+quat) vs derived (angles) |
| `CameraIntrinsics` | commons/camera/model | type, projectionMatrix, fov, fovHorizontal, frustum | **Keep** — projection info is needed |
| `OrbitPoint` | cesium/scene-state | worldPosition, cartographic, source | **Absorb** — anchor in CommonSceneState |
| `ViewSyncPublishedState` | view-sync | sourceId, sourceEngine, frameNumber, timestampMs, target | **Simplify** — metadata moves into CommonSceneState |
| `CapturedCameraState` | cesium/api | position, direction, up, right, cartographic, heading, pitch, roll, fov, matrices | **Keep** — Cesium-internal capture, adapter-only |

### Hash Codecs & Sync

| Component | Package | Purpose | Keep? |
|---|---|---|---|
| `readHashParamsFromViewState()` | view-sync/maplibreAdapter | ViewState → hash params | **Keep** — core encode |
| `readViewStateFromHashValues()` | view-sync/maplibreAdapter | hash params → ViewState | **Keep** — core decode |
| `createCesiumViewStateHashCodec()` | cesium/scene-state | Wraps base with Cesium FOV convention | **Simplify** — FOV convention handling moves to derivation |
| `CesiumSceneStateHashSync` | cesium/scene-state | React component, fires on every camera change | **Rewrite** — event-driven, not per-frame |
| `HASH_ZOOM_CONVENTION` | view-sync | MapLibre vs Leaflet tile size | **Keep** |

### Adapter Functions

| Function | Package | Direction | Keep? |
|---|---|---|---|
| `readViewStateFromSceneState()` | view-sync/targetState | SceneState → ViewState | **Replace** with `deriveViewState(CommonSceneState)` |
| `readViewStateFromMapLibreMap()` | view-sync/maplibreAdapter | MapLibre map → ViewState | **Refactor** to produce CommonSceneState |
| `readViewStateFromLeafletMap()` | view-sync/leafletAdapter | Leaflet map → ViewState | **Refactor** to produce CommonSceneState |
| `projectViewSyncTargetToMapLibre()` | view-sync/maplibreAdapter | ViewState → MapLibre params | **Keep** — derived from CommonSceneState |
| `projectViewSyncTargetToLeaflet()` | view-sync/leafletAdapter | ViewState → Leaflet params | **Keep** — derived from CommonSceneState |
| `cesiumAdapter.toFramework()` | view-sync/cesiumAdapter | ViewState → Cesium HPR | **Refactor** — apply CommonSceneState directly |
| `applyViewSyncTargetToCesiumWidget()` | ViewSyncStory | ViewState → Cesium setView | **Refactor** — adapter.apply(CommonSceneState) |
| `computeCesiumSceneState()` | cesium/scene-state | Scene → SceneState snapshot | **Refactor** → `cesiumAdapter.read(scene)` returning CommonSceneState |
| `buildObjectCentricCameraOrientation()` | cesium/api | ViewState → Cesium destination+orientation | **Keep** — used by cesiumAdapter.apply() internally |
| `applyObjectCentricCameraViewToScene()` | cesium/api | Apply to Cesium camera | **Keep** — used by cesiumAdapter.apply() internally |
| `readInitialCameraViewFromSceneViewState()` | cesium/scene-state | ViewState → Cesium camera init | **Absorb** into cesiumAdapter.apply() |

### Pitch Convention Converters

| Function | Purpose | Keep? |
|---|---|---|
| `toViewSyncPitchFromCesiumPitch()` | Cesium pitch → common pitch | **Move** into cesiumAdapter only |
| `toCesiumPitchFromViewSyncPitch()` | Common pitch → Cesium pitch | **Move** into cesiumAdapter only |

These should not be public API. Pitch conversion is a cesiumAdapter concern.

### FOV Readers

| Function | Purpose | Keep? |
|---|---|---|
| `readViewSyncVerticalFov()` | Extract vertical FOV from ViewState | **Remove** — just read `state.fov` |
| `readViewSyncHorizontalFov()` | Extract horizontal FOV | **Remove** — derive from fov + aspect |
| `readViewSyncLongerEdgeFov()` | Extract longer-edge FOV | **Remove** — derive from fov + aspect |
| `readVerticalFovRad()` | Read from Cesium camera/scene | **Move** into cesiumAdapter |
| `readLongerEdgeFovRad()` | Read from Cesium camera/scene | **Move** into cesiumAdapter |

FOV is stored once (`fov: Radians` = vertical). Horizontal and longer-edge are
derived from fov + viewport aspect ratio. No need for multiple stored FOV fields.

---

## Consolidated Target Architecture

### One Store

```typescript
type SceneStateStoreState = {
  // Canonical camera state (ECEF + quaternion + projection)
  scene: CommonSceneState | null;

  // Controller arbitration
  controllerId: string | null;
  registrations: Record<string, { id: string; engine: string }>;

  // Error tracking
  error: Error | null;
};
```

No serialized snapshots. The store holds live objects. Redux serializableCheck
is disabled for this one slice (it's a camera, not user data — serialization
happens only at the hash boundary).

### One Provider

```tsx
<SceneStateProvider>
  <CesiumSceneAdapter scene={cesiumScene} id="cesium-main" />
  <MapLibreSceneAdapter map={maplibreMap} id="maplibre-main" />
  <SceneStateHashSync mode="on-settle" />
  {children}
</SceneStateProvider>
```

Framework adapters are React components (or hooks) that register themselves,
read from the active framework on user interaction, and apply state from the
store when another framework controls.

### Target Hooks

```typescript
// Read the current scene state
useSceneState(): CommonSceneState | null;

// Derived convenience (computed from CommonSceneState, not stored)
useSceneStateDerived(): {
  bearing: Radians; pitch: Radians; roll: Radians;
  range: Meters; zoom: number;
  longitude: Radians; latitude: Radians; altitude: Meters;
} | null;

// Register a framework adapter
useRegisterSceneAdapter(options: {
  id: string;
  engine: string;
  read: () => CommonSceneState | null;
  apply: (state: CommonSceneState) => void;
}): {
  isController: boolean;
  claimControl: () => void;
};

// Hash init (read once on mount)
useInitialSceneState(): CommonSceneState | null;

// Error
useSceneStateError(): Error | null;
```

### Hash Sync: Event-Driven, Not Per-Frame

Current `CesiumSceneStateHashSync` fires on every `preRender` frame, then
throttles/debounces. This is wasteful and fragile.

**New approach:** Hash updates only on explicit settle events:

```typescript
type HashSyncMode =
  | "on-settle"      // write after camera stops moving (no input for N ms)
  | "on-interaction-end"  // write on mouseup / touchend / wheel-end
  | "manual";        // only write when explicitly requested

<SceneStateHashSync
  mode="on-settle"
  settleMs={300}       // wait 300ms of no camera change
  extraParams={...}
  clearKeys={...}
/>
```

**Settle detection:** The adapter signals `"moving"` / `"idle"` based on
framework events:
- Cesium: `scene.camera.moveStart` / `scene.camera.moveEnd`
- MapLibre: `map.on("movestart")` / `map.on("moveend")`
- Leaflet: `map.on("movestart")` / `map.on("moveend")`

Hash writes only on transition to `"idle"`. No per-frame sampling. No stability
heuristics. Framework tells us when motion ends.

### Framework Adapters (internal, not public API)

Each adapter exports two functions + an event interface:

```typescript
// cesiumAdapter
readFromCesium(scene: CesiumScene): CommonSceneState | null;
applyToCesium(scene: CesiumScene, state: CommonSceneState): void;
subscribeToCesiumEvents(scene: CesiumScene): {
  onCameraChange: (cb: () => void) => () => void;
  onMoveStart: (cb: () => void) => () => void;
  onMoveEnd: (cb: () => void) => () => void;
};

// maplibreAdapter
readFromMapLibre(map: MapLibreMap): CommonSceneState | null;
applyToMapLibre(map: MapLibreMap, state: CommonSceneState): void;
subscribeToMapLibreEvents(map: MapLibreMap): { ... };

// leafletAdapter
readFromLeaflet(map: LeafletMap): CommonSceneState | null;
applyToLeaflet(map: LeafletMap, state: CommonSceneState): void;
subscribeToLeafletEvents(map: LeafletMap): { ... };
```

Adapters are internal to `@carma-mapping/scene-state`. Not exported.
Consumers use the hooks/provider, not adapters directly.

### ViewState stays as derived type

`ViewState` (lon/lat/zoom/bearing/pitch/range) is still useful for:
- Hash encoding/decoding
- Backward compat with code that reads flat angle values
- 2D framework projection (MapLibre/Leaflet need angles, not quaternions)

But it's **always derived**, never stored:

```typescript
function deriveViewState(state: CommonSceneState): ViewState {
  const { bearing, pitch, range, roll } = deriveOrbitAngles(state);
  const { longitude, latitude, altitude } = deriveCartographic(state);
  const zoom = deriveZoom(state);
  return { longitude, latitude, altitude, zoom, bearing, pitch, roll, range, fov: state.fov };
}
```

### Orbit Point: Absorbed

Current `OrbitPoint` (with source tracking and multiple sampling strategies)
becomes just `CommonSceneState.anchor`. The sampling strategy is a cesiumAdapter
concern — it decides WHERE the anchor is when reading from Cesium. Once read,
the anchor is just an ECEF point.

Source tracking (`"screen-center-depth" | "screen-center-globe" | "fallback"`)
moves to adapter-internal diagnostics, not part of the shared state.

---

## Files: Delete / Keep / Refactor

### DELETE (no longer needed)

| File | Reason |
|---|---|
| `sceneStateSerialization.ts` | No lossy round-trip. Store holds live objects. |
| `SceneStateOrbitPoint.ts` → internals | Sampling logic moves into cesiumAdapter.read() |
| `CesiumSceneStateStoreContext.ts` | One context replaces four |
| `CesiumSceneStateReduxContext` | Merged |
| `ViewSyncStoreContext.ts` | Merged |
| `targetState.ts` (most of it) | `readViewStateFromSceneState` → `deriveViewState`. Pitch converters → cesiumAdapter. FOV readers → cesiumAdapter. |

### KEEP (as-is or minor rename)

| File | New Location |
|---|---|
| `@carma-commons/camera/model` types | Stay. CommonSceneState references these. |
| `readHashParamsFromViewState()` | Move to `scene-state/hash/` |
| `readViewStateFromHashValues()` | Move to `scene-state/hash/` |
| `HASH_ZOOM_CONVENTION` | Move to `scene-state/hash/` |
| `readMetersPerCssPixel()` | Move to `scene-state/derivations/` |
| `readRangeFromMetersPerCssPixel()` | Move to `scene-state/derivations/` |
| `useInitialSceneViewState()` | Keep in `scene-state/hooks/` |
| `buildObjectCentricCameraOrientation()` | Keep in `cesium/api` — cesiumAdapter uses it internally |
| `captureCurrentCameraState()` | Keep in `cesium/api` — cesiumAdapter uses it internally |

### REFACTOR

| Current | Target |
|---|---|
| `createViewSyncStore` + `createCesiumSceneStateStore` | → `createSceneStateStore()` (one store) |
| `ViewSyncProvider` + `CesiumSceneStateProvider` | → `SceneStateProvider` (one provider) |
| `CesiumSceneStateHashSync` | → `SceneStateHashSync` (event-driven, framework-agnostic) |
| `computeCesiumSceneState()` | → `cesiumAdapter.read()` (returns CommonSceneState) |
| `readViewStateFromSceneState()` | → `deriveViewState()` (pure function, no Cesium imports) |
| `cesiumAdapter.toFramework()` / `applyObjectCentricCameraViewToScene()` | → `cesiumAdapter.apply()` |
| 6 FOV reader functions | → 1 stored `fov` field + `deriveFovHorizontal(fov, aspect)` |
| 3 FOV type fields on ViewState | → 1 `fov: Radians` (vertical) |

---

## Type Consolidation

### Before (40+ types)

```
ViewState, ViewSyncPublishedState, ViewSyncRegistration, ViewSyncState,
ViewSyncPublishOptions, ViewSyncSetTargetOptions, ViewSyncStore,
SceneState, SceneCamera, SceneStateMetadata, SceneStateOptions,
SceneLighting, OrbitPoint, OrbitPointMode, OrbitPointSamplingStrategy,
OrbitPointSource, SerializedSceneState, CesiumSceneStateStoreState,
CesiumSceneStateStore, ObjectCentricCameraModel, ObjectCentricCameraPose,
ObjectCentricCameraAnchor, CameraPose, CameraBasis, CameraIntrinsics,
CameraFrustum, CameraType, CameraViewOffset, CameraLike, SceneLike,
FrustumLike, EventLike, MapLibreViewValues, LeafletViewValues,
MapLibreAdapterOptions, HashZoomConvention, ...
```

### After

```
// Core (public)
CommonSceneState          — anchor + cameraPosition + orientation + fov + metadata
ViewState                 — derived flat projection (lon/lat/zoom/bearing/pitch/range/fov)
SceneStateStore           — Store type with getState/update/subscribe/destroy
SceneStateRegistration    — { id, engine }

// Camera model (public, from @carma-commons/camera/model — unchanged)
CameraPose
CameraIntrinsics
ObjectCentricCameraPose   — extends CameraPose (kept for consumers that need full model)
ObjectCentricCameraModel

// Adapter-internal (not exported)
CesiumAdapterOptions      — orbit point sampling strategy, fallback height
CameraLike, SceneLike     — stay in cesium/api as Cesium-specific interfaces

// Hash (public)
HashZoomConvention
```

~15 public types instead of 40+.

---

## Summary of Changes

| Area | Before | After |
|---|---|---|
| **Stores** | 2 Redux stores | 1 store |
| **Contexts** | 4 React contexts | 1-2 contexts |
| **Providers** | 2 providers | 1 provider |
| **Hooks** | 12+ | 5-6 |
| **Types** | 40+ | ~15 public |
| **Hash sync** | Per-frame with throttle + debounce + stability heuristic | Event-driven (moveEnd / settle) |
| **Snapshot serialization** | SerializedSceneState with lossy round-trip | None. Live objects in store. |
| **FOV fields** | 3 (vertical, horizontal, longerEdge) | 1 (vertical) + derivation |
| **Pitch converters** | 2 public functions | Internal to cesiumAdapter |
| **FOV readers** | 6 functions | 1 field + 1 derivation |
| **Orbit point** | Separate type with source tracking | Just `anchor: Vector3` on CommonSceneState |
| **Lighting** | Part of SceneState | Dropped from common state (Cesium-internal) |
| **SceneCamera type** | 15+ fields | Replaced by CommonSceneState (5 core fields) |
