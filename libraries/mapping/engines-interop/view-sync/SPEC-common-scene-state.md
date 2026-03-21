# Common Scene State Architecture

## Vision

A single, framework-agnostic scene state owns the camera for all carma mapping.
Frameworks (Cesium, MapLibre, Leaflet, future Three.js) are **renderers only** —
they apply the common state each frame and feed user interactions back into it.

All carma-wide logic — animations, zoom/home actions, camera limits, hash sync —
operates on the common state, never on framework APIs directly.

## Canonical Internal Representation

```
CommonSceneState
├── anchor: ECEF Cartesian3          # orbit target in world coordinates
├── anchorCartographic: LatLngAlt    # same point as geodetic (derived, cached)
├── cameraPosition: ECEF Cartesian3  # camera eye in world coordinates
├── orientation: Quaternion           # camera rotation (world space)
├── projectionMatrix: Matrix4         # perspective/ortho projection
├── fov: Radians                      # vertical FOV (perspective only)
├── near / far: Meters                # frustum planes
└── metadata: { frameNumber, timestampMs, source }
```

### Why ECEF + quaternion

- **No gimbal lock.** Euler heading/pitch/roll from Cesium's camera breaks near
  nadir. Quaternion + ECEF basis vectors are always stable.
- **Framework-neutral.** ECEF is the only coordinate system every 3D engine can
  consume without convention disagreements.
- **Minimal.** Two points (anchor + camera) plus one quaternion encode the full
  6-DOF camera. Everything else is derived.

### Derived quantities (computed on demand, never stored as source of truth)

| Quantity | Derivation |
|---|---|
| bearing | `atan2(-enu.east, -enu.north)` of camera→anchor offset in anchor ENU |
| pitch | `atan2(enu.up, horizontalDist)` + convention shift |
| range | `distance(cameraPosition, anchor)` |
| roll | extracted from quaternion after removing bearing+pitch rotation |
| zoom | from `range + fov + latitude` via MapLibre 512px-tile formula |
| metersPerPixel | `range * tan(fov/2) / (longerViewportEdge/2)` |

These are **read-only projections** used by hash encoding, UI displays, and 2D
framework adapters. They are never written back into the common state.

## Data Flow

### Route load (once, on startup)

```
URL hash
  │  (dumb string: lat,lng,zoom,bearing,pitch,altitude,fov,roll)
  ▼
Hash Decoder (readViewStateFromHashValues)
  │  lat/lng/zoom/bearing/pitch/altitude → ECEF anchor + camera position + quaternion
  ▼
CommonSceneState (initialized)
  │
  ├──▶ Cesium adapter  → scene.camera.setView(destination, orientation)
  ├──▶ MapLibre adapter → map.jumpTo(center, zoom, bearing, pitch)
  └──▶ Leaflet adapter  → map.setView(center, zoom)
```

Hash is read **once**. After init, frameworks never read hash again.

### Runtime sync (per frame)

```
User interacts with framework X (mouse/touch)
  │
  ▼
Framework adapter X reads camera state
  │  Cesium: positionWC + quaternion from inverseViewMatrix
  │  MapLibre: center + zoom + bearing + pitch → ECEF via projection
  │  Leaflet: center + zoom → ECEF (pitch=0, bearing from rotation plugin)
  ▼
CommonSceneState.update(anchor, cameraPosition, orientation, fov)
  │
  ├──▶ Framework adapter Y: apply to scene (if Y ≠ controller)
  ├──▶ Framework adapter Z: apply to scene (if Z ≠ controller)
  ├──▶ Hash encoder (throttled): derive lat/lng/zoom/bearing/pitch → URL
  └──▶ Any carma subscriber: annotations, measurements, etc.
```

### Programmatic actions (zoom, home, animate)

```
App action (e.g. "fly home", "zoom to extent", "orbit animation")
  │
  ▼
Common animation controller
  │  Operates on CommonSceneState directly
  │  Uses quaternion SLERP for rotation, vector LERP for position
  │  Runs per-frame via requestAnimationFrame
  │  Respects camera limits (pitch clamp, altitude floor, bounds)
  ▼
CommonSceneState.update(...)  ← same path as user interaction
  │
  └──▶ All framework adapters render the new state
```

Animations live in the **common layer**, not in Cesium/MapLibre.
Framework-native animations (Cesium `flyTo`, MapLibre `easeTo`) are NOT used
for carma-controlled transitions. They may still run for framework-internal
micro-interactions (e.g. inertial scroll deceleration) but the common state
reconciles after they settle.

## Layer Boundaries

```
┌─────────────────────────────────────────────────────┐
│  App / Feature layer                                │
│  (geoportal, annotations, measurements)             │
│  Reads/writes CommonSceneState. Never touches        │
│  framework APIs for camera.                          │
├─────────────────────────────────────────────────────┤
│  Common Scene State  (@carma-mapping/scene-state)   │
│  ─ Canonical ECEF + quat + projection state         │
│  ─ Animation controller (SLERP/LERP per frame)      │
│  ─ Camera limits (pitch, altitude, bounds)           │
│  ─ Derived readers (bearing, pitch, zoom, range)     │
│  ─ Hash codec (encode/decode, throttled)             │
│  ─ Redux store for React integration                 │
├─────────────────────────────────────────────────────┤
│  Framework Adapters (thin, per-engine)              │
│  ─ cesiumAdapter:   CommonState ↔ Cesium scene      │
│  ─ maplibreAdapter: CommonState ↔ MapLibre map      │
│  ─ leafletAdapter:  CommonState ↔ Leaflet map       │
│  Each adapter:                                       │
│    read():  framework camera → CommonSceneState      │
│    apply(): CommonSceneState → framework camera      │
│  No business logic. No animations. No hash.          │
├─────────────────────────────────────────────────────┤
│  Overlay layer  (label-overlay, etc.)               │
│  ─ Couples directly with active framework scene      │
│  ─ Uses overlay-provider for shared label state      │
│  ─ ZERO dependency on CommonSceneState               │
│  ─ Only needs: framework scene ref + container ref   │
└─────────────────────────────────────────────────────┘
```

## Overlay Decoupling (explicit non-goal)

Overlay (label-overlay, annotation rendering) must NOT depend on the common
scene state infrastructure. Overlays need:

1. A reference to the active framework's scene/canvas (for screen projection)
2. An overlay-provider for shared label/marker state

That's it. The `useCesiumLabelOverlayHost` hook couples overlay to Cesium
directly. If we add Three.js, we add `useThreeLabelOverlayHost`. These hooks
do not go through CommonSceneState. This keeps overlay rendering fast and
simple — one direct framework binding, no abstraction overhead.

## 2D Source Integration

MapLibre and Leaflet are 2D-first but still produce a valid ECEF state:

### MapLibre → CommonSceneState

```
center (lng, lat) + zoom + bearing + pitch
  → anchor = Cartographic.toECEF(lng, lat, 0)   # ground-level anchor
  → range  = rangeFromZoom(zoom, fov, lat)
  → cameraPosition = anchor + ENU_offset(bearing, pitch, range)
  → orientation = quaternionFromBearingPitch(bearing, pitch)
```

### Leaflet → CommonSceneState

```
center (lat, lng) + zoom
  → anchor = Cartographic.toECEF(lng, lat, 0)
  → range  = rangeFromZoom(zoom + 1, fov, lat)   # 256→512 tile convention
  → pitch  = 0 (nadir)
  → bearing = 0 (or from rotation plugin)
  → cameraPosition = anchor + [0, range, 0] in ENU
  → orientation = identity (looking straight down)
```

The common state treats these the same as Cesium — just with simpler orientation.

## Performance Note

The ECEF ↔ framework conversion math (one `Cartographic.toECEF` + one quaternion
decomposition per frame) is trivial compared to any render pass. This adds no
meaningful overhead. If we later adopt Three.js as primary engine, the common
state can be owned directly by a Three.js scene (camera.matrixWorld IS the
common state) with zero conversion cost.

## Existing Code Mapping

| Current | Target |
|---|---|
| `SceneState` (cesium/react/scene-state) | Cesium-specific snapshot → becomes cesiumAdapter.read() output fed into CommonSceneState |
| `ViewState` (view-sync/core/types) | Stays as derived hash-friendly projection of CommonSceneState (lon/lat/zoom/bearing/pitch) |
| `ObjectCentricCameraModel` (commons/camera/model) | Absorbed into CommonSceneState (it already IS position + quaternion + anchor) |
| `readViewStateFromSceneState` (targetState.ts) | Becomes `deriveViewState(commonState)` — pure projection, no Cesium imports |
| `CesiumSceneStateStore` | Replaced by CommonSceneState store + cesiumAdapter |
| `CesiumSceneStateHashSync` | Replaced by CommonSceneState hash sync (framework-agnostic) |
| `createCesiumViewStateHashCodec` | Stays but reads from CommonSceneState instead of Cesium SceneState |
| `ViewSyncStore` | Merged into CommonSceneState (it IS the sync — one state, many renderers) |
| `useCameraOrbit` (geoportal) | Moves animation math to common layer, keeps app-specific trigger logic |
