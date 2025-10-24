# Cesium Scene Initialization Flow

## Architecture Overview

The Cesium engine uses a **ref + callback** paradigm for internal coordination and an **event bus** for external API. This ensures zero re-renders and clean separation of concerns.

## Initialization Flow: 2D → 3D Transition

### 1. Portal Preparation (BEFORE Scene Activation)

Portal wrapper (`CesiumMapComponentWrapper`) must set required refs from context:

```tsx
import { useCesiumContext } from '@carma/cesium/core';

function CesiumMapComponentWrapper() {
  const {
    currentSceneStyleRef,
    initialCamera,
    // ... other refs
  } = useCesiumContext();

  // CRITICAL: Set refs BEFORE setting isActive={true}
  useEffect(() => {
    if (shouldActivate3D) {
      // 1. Set required style
      currentSceneStyleRef.current = portalSelectedStyle; // e.g., "lod2", "mesh-2024"
      
      // 2. Set initial camera position
      initialCamera.current = {
        latitude: 51.2621,    // degrees
        longitude: 7.1771,    // degrees
        altitude: 10000,      // meters
        heading: 0,           // radians
        pitch: -1.57,         // radians (-90° = top-down)
        roll: 0               // radians
      };
      
      // 3. NOW activate scene (will mount component)
      setIsActive(true);
    }
  }, [shouldActivate3D]);

  return (
    <CesiumSceneComponent 
      isActive={isActive}
      containerRef={containerRef}
    />
  );
}
```

### 2. Scene Component Mounts

When `isActive` becomes `true`, `CesiumSceneComponent` mounts and:

```tsx
// CesiumSceneComponent.tsx
export function CesiumSceneComponent({ isActive, containerRef }) {
  // Only fetches config (static, no re-renders)
  const { config } = useCesiumContext();

  // Widget initialization
  useInitCesiumWidget(containerRef, isActive, options);

  // Hooks fetch their own refs internally - NO PARAMETER PASSING
  useSceneCameraTracking();     // Reads initialCamera ref
  useSceneStyleSwitcher();       // Reads currentSceneStyleRef on mount
}
```

### 3. Scene Hooks Initialize

#### `useSceneStyleSwitcher` (on mount):
```tsx
useEffect(() => {
  // Register callback for runtime style changes
  sceneStyleApplierRef.current = applySceneStyle;
  
  // Apply initial style from context ref
  const initialStyle = currentSceneStyleRef.current;
  if (initialStyle) {
    applySceneStyle(initialStyle);  // Applies backgroundColor, globe, shadows
  } else {
    console.warn("No initial style set - portal should set before activation");
  }
}, []); // Runs once on mount
```

#### `useSceneCameraTracking` (on mount):
```tsx
useEffect(() => {
  // Register callback for start/stop control
  sceneCameraTrackerRef.current = startStopTracking;
  
  // Start tracking (initial position handled by transition)
  startStopTracking('start');
  
  // Updates currentCameraRef every frame
  // Updates moveendCameraRef when camera stops (debounced)
}, []);
```

## Key Principles

### ✅ Portal Sets Refs BEFORE Activation
```tsx
// CORRECT
currentSceneStyleRef.current = "lod2";
initialCamera.current = cameraState;
setIsActive(true);  // NOW mount scene
```

### ❌ Don't Pass Props
```tsx
// WRONG - causes re-renders
<CesiumSceneComponent 
  sceneStyle="lod2"           // ❌ NO
  initialCamera={cameraState} // ❌ NO
/>
```

### ✅ Scene Hooks Are Self-Contained
```tsx
// CORRECT - hooks fetch from context
useSceneStyleSwitcher();     // ✅ No parameters
useSceneCameraTracking();    // ✅ Fetches refs internally
```

### ❌ Don't Forward Context Refs
```tsx
// WRONG - breaks encapsulation
useSceneStyleSwitcher(currentSceneStyleRef);  // ❌ NO
```

## Internal vs External Coordination

### Internal (Context ↔ Scene): Refs + Callbacks
- Portal → Context refs (direct write)
- Scene → Context refs (direct read/write)
- Context → Scene callbacks (registered in refs)
- **No events, no props, no re-renders**

### External (App ↔ Context): Event Bus
- MapTypeSwitcher emits `SetSceneStyle` event
- Portal reads `moveendCameraRef` for hash updates
- UI components subscribe to `CameraChanged` events

## Troubleshooting

### "No initial style set" Warning
**Cause:** Portal didn't set `currentSceneStyleRef` before activation

**Fix:**
```tsx
useEffect(() => {
  currentSceneStyleRef.current = "lod2";  // Set FIRST
  setIsActive(true);                      // Then activate
}, [shouldActivate]);
```

### "No scene available" Error
**Cause:** Scene component not mounted (`isActive={false}`)

**Fix:** Ensure portal sets `isActive={true}` after setting refs

### Scene Initializes with Wrong Style
**Cause:** Portal set wrong value or set it too late

**Fix:**
```tsx
// Set ref BEFORE isActive becomes true
useEffect(() => {
  if (isMode2d) {
    setIsActive(false);
  } else {
    currentSceneStyleRef.current = selectedStyle;  // Set first
    setIsActive(true);                              // Then activate
  }
}, [isMode2d, selectedStyle]);
```

## Benefits of This Architecture

✅ **Zero re-renders** - Refs don't trigger React updates  
✅ **Lazy loading** - Portal can set refs before scene exists  
✅ **Clean separation** - Internal (refs) vs External (events)  
✅ **Survives remounts** - Refs persist across scene lifecycle  
✅ **Self-contained hooks** - No parameter passing needed  
✅ **Type-safe** - TypeScript validates ref types  

## Migration from Old Pattern

### Before (Config-Based):
```tsx
// OLD - initialStyle in static config
const config = {
  initialStyle: "lod2",  // ❌ Static, can't change
  // ...
};
```

### After (Ref-Based):
```tsx
// NEW - Portal controls initialization
currentSceneStyleRef.current = portalStyle;  // ✅ Dynamic
setIsActive(true);
```

This enables proper 2D→3D transitions with lazy-loaded scenes!
