# Cesium Core - Development Guide

## Architecture

### Separation of Concerns

**CesiumContextProvider** - Configuration & Coordination Layer
- Provides static configuration (camera home pose, zoom limits)
- Event bus for cross-component communication (subscribe/emit)
- Widget/Scene singleton refs (shared across app)
- Lifecycle tracking (widget instance history)
- **Does NOT own scene resources** (terrain, imagery, tilesets)

**CesiumSceneComponent** - Scene Instance Layer
- Owns scene-specific resources (terrain, imagery, tilesets, models)
- Resource managers initialize on mount, cleanup on unmount
- Subscribes to activation events for initialization data
- **Resources are NOT shareable between widget instances**

### Key Principle

```
Context = Configuration (survives remounts)
Scene Component = Instance Resources (destroyed on unmount)
Events = Runtime State (activation, style changes, camera updates)
```

This aligns with Cesium's internal architecture:
```
CesiumWidget (singleton per activation)
  └── Scene (1:1 with widget)
      ├── Globe → TerrainProvider
      ├── ImageryLayerCollection → ImageryLayer[]
      └── Primitives → Cesium3DTileset[]
```

## Event-Driven Architecture

### Activation Event Pattern

**Problem:** Scene component needs runtime state (current map style, camera position) when it mounts.

**Wrong Approach:** Pass as props
```typescript
// ❌ Props for runtime state
<CesiumSceneComponent
  initialMapStyle={currentMapStyle}
  initialCameraLocation={currentCameraLocation}
/>
```

**Correct Approach:** Subscribe to activation event
```typescript
// ✅ Event carries activation context
useEffect(() => {
  const unsub = subscribe(CtxEvent.Activate, (activationData) => {
    // activationData contains:
    // - currentMapStyle (from portal)
    // - currentCameraLocation (from portal)
    // - source: "url" | "transition" | "cold-start"
    
    // Apply on scene ready
  });
  return () => unsub();
}, []);
```

**Why:**
- ✅ Scene component doesn't depend on portal state
- ✅ Activation event is the natural trigger point
- ✅ Props are only for configuration, not runtime state
- ✅ Follows event-driven architecture consistently

### Event Types

**Configuration Events** (from context)
- `CtxEvent.Activate` - 3D mode activated (carries current state)
- `CtxEvent.Suspend` - 3D mode suspended (2D mode)
- `CtxEvent.SceneReady` - Scene initialized and ready

**State Change Events** (from portal/app)
- `CtxEvent.SetSceneStyle` - Change map style
- `CtxEvent.SetCameraState` - Update camera position
- `CtxEvent.SetTilesetVisibility` - Show/hide tileset

**Response Events** (from scene)
- `CtxEvent.CameraChanged` - Camera moved
- `CtxEvent.SceneResourcesReady` - Resources loaded

## Design Decisions

### 1. Ref-Based State (Not Reactive)

Context uses refs instead of React state to avoid re-renders:

```typescript
// ✅ Ref-based (no re-renders)
const isSuspendedRef = useRef(false);
isSuspendedRef.current = true; // No re-render

// ❌ State-based (causes re-renders)
const [isSuspended, setIsSuspended] = useState(false);
setIsSuspended(true); // Re-renders entire tree
```

**Why:** Cesium API calls don't need React re-renders. Event bus handles coordination.

### 2. Scene-Owned Resources

Provider refs (terrain, imagery, tilesets) live in CesiumSceneComponent, not context:

```typescript
// ✅ Scene-owned (destroyed on unmount)
function CesiumSceneComponent() {
  const terrainProviderRef = useRef(null);
  const imageryLayersRef = useRef(new Map());
  // ...
}

// ❌ Context-owned (survives remounts, causes stale refs)
function CesiumContextProvider() {
  const terrainProviderRef = useRef(null); // Wrong!
}
```

**Why:** Resources are tied to widget/scene lifecycle, not app lifecycle.

### 3. Single Camera Initializer

All camera initialization scenarios handled in one hook:

```typescript
// ✅ Unified (one source of truth)
const { cameraState } = useDetermineInitialCameraState({
  initialCameraLocation,
});

// ❌ Scattered (multiple sources, conflicts)
useInitCesiumWidget(); // Has camera init
useEnsureCesiumInitialized(); // Has camera init
useHomeControl(); // Has camera init
```

**Why:** Priority-based logic prevents conflicts. See [CAMERA-INITIALIZATION.md](./CAMERA-INITIALIZATION.md).

### 4. Event-Driven Style Switching

Style changes flow through events, not props:

```typescript
// ✅ Event-driven
emit(CtxEvent.SetSceneStyle, "satellite");

// Scene component subscribes:
subscribe(CtxEvent.SetSceneStyle, (styleId) => {
  // Diff tilesets/imagery
  // Apply visibility changes
});

// ❌ Prop-driven (causes re-renders)
<CesiumSceneComponent currentStyle={style} />
```

**Why:** Avoids re-rendering entire component tree for style changes.

## API

### Hooks

**Context Access:**
- `useCesiumContext()` - Access scene ref, emit/subscribe, config

**Camera Control:**
- `useDetermineInitialCameraState()` - Unified camera initialization
- `useHomeControl()` - Fly to home position
- `useZoomControls()` - Zoom in/out controls

**Scene Management:**
- `useTilesetManager()` - Load/manage 3D tilesets
- `useImageryManager()` - Load/manage imagery layers
- `useTerrainManager()` - Load/manage terrain providers

### Events

**Lifecycle:**
- `CtxEvent.Activate` - 3D mode activated
- `CtxEvent.Suspend` - 3D mode suspended
- `CtxEvent.SceneReady` - Scene initialized

**Style:**
- `CtxEvent.SetSceneStyle` - Change map style
- `CtxEvent.ToggleSceneStyle` - Toggle between styles

**Resources:**
- `CtxEvent.SetTilesetVisibility` - Show/hide tileset
- `CtxEvent.SetTilesetOpacity` - Change tileset opacity
- `CtxEvent.SetImageryVisibility` - Show/hide imagery layer
- `CtxEvent.SetImageryOpacity` - Change imagery opacity

**Camera:**
- `CtxEvent.SetCameraState` - Update camera position
- `CtxEvent.GoHome` - Fly to home position
- `CtxEvent.CameraChanged` - Camera moved (emitted by scene)

**Animation:**
- `CtxEvent.AnimationStart` - Animation started
- `CtxEvent.AnimationEnd` - Animation ended

## Performance

### Request Render Mode

Cesium runs in "request render" mode (not continuous):

```typescript
// Scene only renders when explicitly requested
scene.requestRenderMode = true;

// Request render after changes
scene.requestRender();
```

**Why:** Saves CPU/GPU when scene is static. Only renders on interaction or updates.

### Ref-Based State

Context uses refs instead of state to avoid React re-renders:

```typescript
// No re-renders for Cesium API calls
isSuspendedRef.current = true;
emit(CtxEvent.Suspend); // Event bus notifies subscribers
```

**Why:** Cesium API doesn't need React re-renders. Event bus provides coordination without render overhead.

### Lazy Loading

Cesium API is lazy-loaded to reduce initial bundle size:

```typescript
// Dynamic import
const { Cartesian3 } = await import("@carma/cesium");
```

**Why:** Cesium is large (~10MB). Only load when 3D mode is activated.

## Testing

### Unit Tests

Test hooks in isolation:

```typescript
import { renderHook } from '@testing-library/react';
import { useDetermineInitialCameraState } from './use-determine-initial-camera-state';

test('crash recovery has highest priority', () => {
  const { result } = renderHook(() => 
    useDetermineInitialCameraState({
      initialCameraLocation: { lat: 51, lng: 7, zoom: 15 },
    })
  );
  
  expect(result.current.source).toBe('crash-recovery');
});
```

### Integration Tests

Test event flow:

```typescript
test('activation event triggers scene initialization', async () => {
  const { emit, subscribe } = createEventBus();
  
  const handler = jest.fn();
  subscribe(CtxEvent.SceneReady, handler);
  
  emit(CtxEvent.Activate, { currentMapStyle: 'satellite' });
  
  await waitFor(() => expect(handler).toHaveBeenCalled());
});
```

## Migration Guide

### From Props to Events

**Old:**
```typescript
<CesiumSceneComponent
  initialMapStyle={currentMapStyle}
  initialCameraLocation={currentCameraLocation}
/>
```

**New:**
```typescript
// In PortalProvider or app:
emit(CtxEvent.Activate, {
  currentMapStyle,
  currentCameraLocation,
  source: "transition",
});

// In CesiumSceneComponent:
useEffect(() => {
  const unsub = subscribe(CtxEvent.Activate, (data) => {
    // Use data.currentMapStyle, data.currentCameraLocation
  });
  return () => unsub();
}, []);
```

### From Multiple Camera Initializers to Unified Hook

**Old:**
```typescript
// Scattered across multiple files
useInitCesiumWidget(); // Has camera init
useEnsureCesiumInitialized(); // Has camera init
useHomeControl(); // Has camera init
```

**New:**
```typescript
// Single source of truth
const { cameraState, source } = useDetermineInitialCameraState({
  initialCameraLocation,
});
```

See [CAMERA-INITIALIZATION.md](./CAMERA-INITIALIZATION.md) for details.

## Related Documentation

- [CAMERA-INITIALIZATION.md](./CAMERA-INITIALIZATION.md) - Camera initialization system
- [ARCHITECTURE-REFACTOR.md](./ARCHITECTURE-REFACTOR.md) - Provider refs migration notes
- [README.md](./README.md) - User-facing setup guide
