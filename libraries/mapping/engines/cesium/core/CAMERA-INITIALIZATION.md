# Camera Initialization Architecture

## Overview

Unified camera initialization system that handles all scenarios through a single hook: `useDetermineInitialCameraState()`.

## Four Scenarios (Priority Order)

### 1. Crash Recovery (Highest Priority)
**Trigger:** Widget remounted after error  
**Source:** `context.lastCameraStateRef.current`  
**Format:** `CameraPrimitive` (already in Cesium internal format)  
**Action:** Restore exact camera state before crash

```typescript
// lastCameraStateRef is populated by camera change listener
// When widget crashes and remounts, this ref still has the last known state
if (lastCameraStateRef.current) {
  return lastCameraStateRef.current; // No conversion needed
}
```

### 2. URL State (Deep Link)
**Trigger:** User opens deep link with camera params  
**Source:** `initialCameraLocation` with `source: "url"`  
**Format:** `{ lat, lng, zoom, heading?, pitch?, fov? }`  
**Action:** Convert to CameraPrimitive and apply

```typescript
// Example URL: app.com/#/3d/lat=51.27&lng=7.20&zoom=15&heading=45&pitch=-60
if (initialCameraLocation?.source === "url") {
  return convertLatLngZoomToCameraPrimitive(initialCameraLocation);
}
```

### 3. 2D→3D Transition
**Trigger:** User switches from 2D to 3D mode  
**Source:** `initialCameraLocation` with `source: "transition"`  
**Format:** `{ lat, lng, zoom }` (current 2D map center + zoom)  
**Action:** Convert to CameraPrimitive with default orientation

```typescript
// User was viewing 2D map at specific location
// Derive 3D camera from 2D position
if (initialCameraLocation?.source === "transition") {
  return convertLatLngZoomToCameraPrimitive(initialCameraLocation);
}
```

### 4. Cold Start (Lowest Priority)
**Trigger:** App opens directly in 3D mode, no URL state  
**Source:** `config.cameraHomePose`  
**Format:** `CameraPoseRadians`  
**Action:** Convert to CameraPrimitive

```typescript
// No other camera state available, use config default
if (config.cameraHomePose) {
  return convertCameraPoseToCameraPrimitive(config.cameraHomePose);
}
```

## Output Format

All scenarios output **CameraPrimitive** (Cesium internal state):

```typescript
interface CameraPrimitive {
  position: Cartesian3;    // Camera position in world space
  direction: Cartesian3;   // Unit vector pointing where camera looks
  up: Cartesian3;          // Unit vector pointing "up" for camera
  right: Cartesian3;       // Unit vector pointing "right" for camera
  fov: number;             // Field of view in radians
}
```

This format matches Cesium's internal camera representation and can be applied directly.

## Format Conversions

### Lat/Lng/Zoom → CameraPrimitive

```typescript
// 2D map format (Leaflet-like)
{ lat: 51.27, lng: 7.20, zoom: 15 }

// Conversion:
// 1. Calculate height from zoom: height = 40075000 / 2^zoom
// 2. Create position: Cartesian3.fromDegrees(lng, lat, height)
// 3. Default orientation: looking down (pitch=-90°), north up (heading=0°)
// 4. Calculate direction/up/right vectors from heading/pitch
```

### CameraPoseRadians → CameraPrimitive

```typescript
// Config format (radians)
{
  lat: 0.894,      // radians
  lng: 0.126,      // radians
  altitude: 1000,  // meters
  heading: 0,      // radians
  pitch: -1.57,    // radians
  roll: 0,         // radians
  fov: 1.047       // radians (60°)
}

// Conversion:
// 1. Create position: Cartesian3.fromRadians(lng, lat, altitude)
// 2. Create HPR quaternion: headingPitchRollQuaternion(position, hpr)
// 3. Extract direction/up/right from rotation matrix
```

## Usage in CesiumSceneComponent

```typescript
export function CesiumSceneComponent({
  initialCameraLocation,
  ...props
}: CesiumSceneComponentProps) {
  // Unified camera initialization
  const { cameraState, source } = useDetermineInitialCameraState({
    initialCameraLocation,
  });

  useEffect(() => {
    const unsubSceneReady = subscribe(CtxEvent.SceneReady, () => {
      if (cameraState) {
        console.log(`Applying camera from: ${source}`);
        emit(CtxEvent.SetCameraState, cameraState);
      }
    });
    
    return () => unsubSceneReady();
  }, [cameraState, source]);
}
```

## Data Flow

```
Portal Context (current state)
  ↓
  initialCameraLocation: { lat, lng, zoom, source }
  ↓
CesiumMapComponentWrapper (passes as prop)
  ↓
CesiumSceneComponent
  ↓
useDetermineInitialCameraState()
  ├─ Check lastCameraStateRef (crash recovery)
  ├─ Check initialCameraLocation.source === "url"
  ├─ Check initialCameraLocation.source === "transition"
  └─ Fallback to config.cameraHomePose
  ↓
CameraPrimitive (unified output)
  ↓
Apply to Cesium camera on SceneReady
```

## Benefits

✅ **Single source of truth** - One hook handles all scenarios  
✅ **Priority-based** - Clear precedence order prevents conflicts  
✅ **Format agnostic** - Accepts multiple input formats, outputs unified format  
✅ **Testable** - Each scenario can be tested independently  
✅ **Maintainable** - All camera initialization logic in one place  
✅ **Crash resilient** - Preserves camera state across widget remounts

## Migration Notes

### Old Pattern (REMOVED)
```typescript
// Multiple scattered initializers
useInitCesiumWidget() // Had camera init logic
useEnsureCesiumInitialized() // Had camera init logic
useHomeControl() // Had camera init logic
// Config merging in PortalProvider
```

### New Pattern (CURRENT)
```typescript
// Single unified initializer
useDetermineInitialCameraState() // Handles ALL scenarios
```

All old camera initialization code should be removed and replaced with this unified hook.
