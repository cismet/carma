# Implementation Steps: Common Scene State

Ordered by dependency. Each step produces a working, testable increment.

## Step 0 — Immediate fix (NOW, this branch)

**Fix the terrain sync bug** that currently breaks Cesium → others.

- `createCesiumSceneStateStore.getSnapshot()` returns live in-memory snapshot
  instead of round-tripping through lossy serialization.
- Already applied. Unblocks current work without architecture changes.

## Step 1 — Define CommonSceneState type

**Package:** `@carma-mapping/scene-state` (new, or rename `engines-interop/view-sync`)

```typescript
type CommonSceneState = {
  anchor: Vector3;                    // ECEF orbit target
  anchorCartographic: LatLngAlt.rad;  // cached geodetic of anchor
  cameraPosition: Vector3;            // ECEF camera eye
  orientation: Quaternion;            // camera world rotation
  fov: Radians;                       // vertical FOV
  near: Meters;
  far: Meters;
  metadata: {
    frameNumber: number | null;
    timestampMs: number;
    source: string;                   // "cesium" | "maplibre" | "leaflet" | "animation" | "hash"
    controllerId: string | null;      // which adapter currently drives
  };
};
```

**Derived reader functions** (pure, no side effects):

```typescript
// All derive from anchor + cameraPosition + orientation + fov
deriveRange(state: CommonSceneState): Meters;
deriveBearing(state: CommonSceneState): Radians;
derivePitch(state: CommonSceneState): Radians;
deriveRoll(state: CommonSceneState): Radians;
deriveZoom(state: CommonSceneState, tileSize?: number): number;
deriveMetersPerPixel(state: CommonSceneState, viewportWidth: number, viewportHeight: number): Meters;
deriveViewState(state: CommonSceneState): ViewState; // for hash encoding & backward compat
```

**ENU helper** (reuse existing `getEastNorthUpOffset` from `@carma/cesium`):

```typescript
// anchor ECEF → ENU frame at anchor → camera offset in ENU → bearing/pitch/range
deriveOrbitAnglesFromECEF(anchor: Vector3, camera: Vector3): {
  bearing: Radians; pitch: Radians; range: Meters;
};
```

**Tests:** Round-trip Cesium capture → CommonSceneState → derive angles → matches
original Cesium heading/pitch/range within epsilon.

**Files to create:**
- `libraries/mapping/engines-interop/scene-state/src/lib/types.ts`
- `libraries/mapping/engines-interop/scene-state/src/lib/derivations.ts`
- `libraries/mapping/engines-interop/scene-state/src/lib/derivations.spec.ts`

## Step 2 — CommonSceneState store

**Redux store** (or vanilla observable — Redux for React integration):

```typescript
type CommonSceneStateStore = {
  getState(): CommonSceneState | null;
  update(patch: Partial<CommonSceneState>, source: string): void;
  subscribe(listener: () => void): () => void;
  destroy(): void;
};
```

**Controller arbitration** (from current ViewSyncStore, simplified):
- `update()` checks `metadata.controllerId`
- Only the current controller can update
- Control claimed by adapter on user interaction
- Programmatic actions (animations) claim control with source="animation"

**Replaces:** `ViewSyncStore` + `CesiumSceneStateStore` (two stores → one)

**Files to create:**
- `libraries/mapping/engines-interop/scene-state/src/lib/createCommonSceneStateStore.ts`
- `libraries/mapping/engines-interop/scene-state/src/lib/CommonSceneStateProvider.tsx`
- `libraries/mapping/engines-interop/scene-state/src/lib/useCommonSceneState.ts`

## Step 3 — Framework adapters (read + apply)

Each adapter is a thin pair of functions. No business logic.

### Cesium adapter

```typescript
// Read: Cesium scene → CommonSceneState
readCommonStateFromCesium(scene: Scene): CommonSceneState;
  // Uses captureCurrentCameraState() → ECEF position + quaternion from inverseViewMatrix
  // Orbit point from screen-center sampling (existing logic)

// Apply: CommonSceneState → Cesium scene
applyCommonStateToCesium(scene: Scene, state: CommonSceneState): void;
  // Decompose: anchor + cameraPosition → HeadingPitchRange for lookAt
  // Or: set camera.position + direction/up from quaternion directly
  // Set FOV on frustum
```

### MapLibre adapter

```typescript
readCommonStateFromMapLibre(map: maplibregl.Map): CommonSceneState;
  // center/zoom/bearing/pitch → ECEF anchor + camera position

applyCommonStateToMapLibre(map: maplibregl.Map, state: CommonSceneState): void;
  // CommonSceneState → center/zoom/bearing/pitch via deriveViewState()
```

### Leaflet adapter

```typescript
readCommonStateFromLeaflet(map: L.Map): CommonSceneState;
  // center/zoom → ECEF (pitch=0, bearing=0 unless rotation plugin)

applyCommonStateToLeaflet(map: L.Map, state: CommonSceneState): void;
  // CommonSceneState → center/zoom (ignore pitch/bearing for base Leaflet)
```

**Key:** adapters import from `@carma-mapping/scene-state` only. No cross-adapter
imports. No hash logic. No animation logic.

**Files to create/refactor:**
- `libraries/mapping/engines-interop/scene-state/src/lib/adapters/cesium.ts`
- `libraries/mapping/engines-interop/scene-state/src/lib/adapters/maplibre.ts`
- `libraries/mapping/engines-interop/scene-state/src/lib/adapters/leaflet.ts`

**Reuse:** Existing `getEastNorthUpOffset`, `captureCurrentCameraState`,
`buildObjectCentricCameraOrientation`, `projectViewSyncTargetToMapLibre`,
`projectViewSyncTargetToLeaflet`. Wrap, don't rewrite.

## Step 4 — Hash codec (framework-agnostic)

```typescript
// Encode: CommonSceneState → hash params
encodeHashFromCommonState(state: CommonSceneState): HashParams;
  // Internally calls deriveViewState() then existing readHashParamsFromViewState()

// Decode: hash params → CommonSceneState
decodeCommonStateFromHash(params: HashParams): CommonSceneState;
  // Internally calls readViewStateFromHashValues() then builds ECEF from angles
```

**Hash sync component** (replaces CesiumSceneStateHashSync):

```typescript
<CommonSceneStateHashSync
  store={commonStore}
  codec={hashCodec}
  throttleMs={100}
  settleMs={350}
/>
```

Framework-agnostic. Reads `CommonSceneState`, writes hash. Reads hash on mount,
writes initial state. Never touches any framework API.

**Files to create:**
- `libraries/mapping/engines-interop/scene-state/src/lib/hash/codec.ts`
- `libraries/mapping/engines-interop/scene-state/src/lib/hash/CommonSceneStateHashSync.tsx`

## Step 5 — Animation controller (common layer)

```typescript
type AnimationTarget = {
  anchor: Vector3;
  cameraPosition: Vector3;
  orientation: Quaternion;
  fov?: Radians;
};

type AnimationOptions = {
  durationMs: number;
  easing: (t: number) => number;
  onComplete?: () => void;
};

createSceneStateAnimationController(store: CommonSceneStateStore): {
  flyTo(target: AnimationTarget, options: AnimationOptions): void;
  orbit(axisPoint: Vector3, radiansPerSecond: number): void;
  stop(): void;
};
```

**Math:** Quaternion SLERP for rotation, Vector3 LERP for position, scalar
LERP for FOV. All in ECEF — no framework calls.

**Per-frame:** Uses `requestAnimationFrame`. Each tick:
1. Interpolate current → target
2. `store.update(interpolated, "animation")`
3. Framework adapters pick up the change and render

**Replaces:** `useCameraOrbit` animation math (app keeps trigger logic),
Cesium `flyTo`/`flyToBoundingSphere` for carma-controlled transitions.

**Files to create:**
- `libraries/mapping/engines-interop/scene-state/src/lib/animation/controller.ts`
- `libraries/mapping/engines-interop/scene-state/src/lib/animation/easing.ts`

## Step 6 — Migrate consumers

### 6a — ViewSync story (side-by-side)

Replace:
- `CesiumSceneStateProvider` + `useCesiumSceneStateOptional` + `readViewStateFromSceneState`
- `ViewSyncProvider` + `useRegisterViewSyncParticipant`

With:
- `CommonSceneStateProvider` + `useCommonSceneState`
- Cesium/MapLibre/Leaflet adapter hooks

### 6b — Geoportal

Replace:
- `CesiumSceneStateProvider` + `CesiumSceneStateHashSync`
- `useInitialSceneViewState` (hash decode → Cesium setView)
- `useCameraOrbit` animation math

With:
- `CommonSceneStateProvider` + `CommonSceneStateHashSync`
- Hash decode → `CommonSceneState` → adapter applies
- Animation controller for orbit

### 6c — Deprecate old packages

- `view-sync` core store → absorbed into scene-state store
- `CesiumSceneStateStore` → replaced by common store + cesium adapter
- `CesiumSceneStateHashSync` → replaced by `CommonSceneStateHashSync`
- `readViewStateFromSceneState` → replaced by `deriveViewState`
- `ViewState` type stays as derived projection type (hash-friendly)

## Step 7 — Clean up redundancies

- Remove `SceneState` type (replaced by `CommonSceneState`)
- Remove `SerializedSceneState` (common state serialization is simpler: 2 Vec3 + 1 Quat + 1 float)
- Remove `sceneStateSerialization.ts` (no more lossy round-trip)
- Remove `targetState.ts` Cesium imports (derivations are framework-agnostic)
- Remove pitch convention converters (common pitch IS the convention, adapters convert at boundary)
- Collapse `ObjectCentricCameraModel` into `CommonSceneState` (same data, one type)

## Dependency Graph (target)

```
@carma-mapping/scene-state (NEW, framework-agnostic)
├── types.ts           ← CommonSceneState, no framework imports
├── derivations.ts     ← bearing/pitch/zoom/range from ECEF vectors
├── store.ts           ← Redux store + controller arbitration
├── provider.tsx       ← React provider + hooks
├── hash/              ← encode/decode, sync component
├── animation/         ← SLERP/LERP controller
└── adapters/
    ├── cesium.ts      ← imports @carma/cesium only
    ├── maplibre.ts    ← imports maplibre-gl only
    └── leaflet.ts     ← imports leaflet only

@carma-providers/label-overlay (UNCHANGED)
└── NO imports from scene-state. Ever.

@carma-mapping/engines/cesium/react/scene-state (DEPRECATED)
└── Thin re-export wrapper during migration
```

## What NOT to change

- **Label overlay internals.** Overlay couples to framework scene directly via
  host binding hooks. No scene-state dependency.
- **Framework-internal micro-interactions.** Cesium's mouse handler, MapLibre's
  inertial scroll — these stay native. The adapter reads their result.
- **Hash parameter format.** `lat,lng,zoom,bearing,pitch,altitude,fov,roll` stays.
  Only the plumbing changes, not the URL shape.
- **`@carma-commons/camera/model` types.** `ObjectCentricCameraPose`, `CameraIntrinsics`
  etc. are good shared types. `CommonSceneState` can embed or extend them.
