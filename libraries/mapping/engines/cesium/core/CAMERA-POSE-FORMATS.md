# Camera Pose Formats

## Format Differentiators

The key differentiator between formats is the **altitude vs height** field:

### Portal/CARMA Format (User-Facing)
```typescript
interface CameraPosePortal {
  latitude: number;   // degrees
  longitude: number;  // degrees
  altitude: number;   // ← DIFFERENTIATOR: meters above WGS84 ellipsoid
  heading?: number;   // degrees
  pitch?: number;     // degrees
  roll?: number;      // degrees
}
```

**Used in:**
- `PortalConfig.homePose3d`
- `PortalConfig.defaultCameraLocation`
- User-facing configuration files
- URL hash parameters (after parsing)

**Characteristics:**
- ✅ User-friendly (degrees are intuitive)
- ✅ Matches geographic conventions
- ✅ Easy to configure manually

### Cesium Internal Format
```typescript
interface CameraPoseRadians {
  latitude: number;   // radians
  longitude: number;  // radians
  height: number;     // ← DIFFERENTIATOR: meters above WGS84 ellipsoid
  heading?: number;   // radians
  pitch?: number;     // radians
  roll?: number;      // radians
}
```

**Used in:**
- Cesium engine internals
- Camera calculations
- Internal state storage

**Characteristics:**
- ⚙️ Cesium native format
- ⚙️ Optimized for calculations
- ⚙️ Not user-friendly

## Conversion

### Portal → Cesium
```typescript
import { convertPortalPoseToCesiumPose } from '@carma-mapping/engines/cesium/core';

const portalPose: CameraPosePortal = {
  latitude: 51.27,
  longitude: 7.20,
  altitude: 10000,  // ← 'altitude' field
  heading: 0,
  pitch: -90,
  roll: 0,
};

const cesiumPose = convertPortalPoseToCesiumPose(portalPose);
// {
//   latitude: 0.894...,
//   longitude: 0.125...,
//   height: 10000,    // ← 'height' field (renamed)
//   heading: 0,
//   pitch: -1.570...,
//   roll: 0,
// }
```

## Architecture Flow

```
PortalConfig (degrees + altitude)
  ↓
  portalConfig.homePose3d: CameraPosePortal
  ↓
CesiumContextProvider props
  ↓
  homeCameraPose prop (Portal format)
  ↓
convertPortalPoseToCesiumPose()
  ↓
CameraPoseRadians (radians + height)
  ↓
Cesium Engine
```

## Best Practices

### ✅ DO
- Use `CameraPosePortal` (altitude + degrees) in all user-facing configs
- Convert at the boundary (CesiumContextProvider)
- Store Portal format in PortalConfig
- Pass Portal format as props to CesiumContextProvider

### ❌ DON'T
- Don't use `CameraPoseRadians` in user configs
- Don't manually convert degrees to radians in config files
- Don't mix formats (always be explicit about which format you're using)
- Don't use `height` field in Portal configs (use `altitude`)

## Type Safety

The field name difference (`altitude` vs `height`) provides **compile-time type safety**:

```typescript
// ✅ Correct - Portal format
const portalPose: CameraPosePortal = {
  latitude: 51.27,
  longitude: 7.20,
  altitude: 10000,  // TypeScript enforces 'altitude'
};

// ❌ Error - Can't use 'height' in Portal format
const wrongPose: CameraPosePortal = {
  latitude: 51.27,
  longitude: 7.20,
  height: 10000,  // TypeScript error!
};

// ✅ Correct - Cesium format
const cesiumPose: CameraPoseRadians = {
  latitude: 0.894,
  longitude: 0.125,
  height: 10000,  // TypeScript enforces 'height'
};
```

## Migration Guide

### Old Pattern (Manual Conversion)
```typescript
// ❌ Old: Manual conversion in config
cameraHomePose: {
  longitude: (7.20 * Math.PI) / 180,
  latitude: (51.27 * Math.PI) / 180,
  height: 10000,
  heading: 0,
  pitch: -Math.PI / 2,
  roll: 0,
}
```

### New Pattern (Automatic Conversion)
```typescript
// ✅ New: Portal format in config
portalConfig.homePose3d = {
  latitude: 51.27,
  longitude: 7.20,
  altitude: 10000,
  heading: 0,
  pitch: -90,
  roll: 0,
};

// Conversion happens automatically in CesiumContextProvider
<CesiumContextProvider
  config={cesiumConfig}
  homeCameraPose={portalConfig.homePose3d}
/>
```

## Related Files

- **Converter:** `cesium/core/src/lib/utils/camera-pose-converter.ts`
- **Types:** `cesium/api/src/lib/Scene/Camera.d.ts`
- **Provider:** `cesium/core/src/lib/context/CesiumContextProvider.tsx`
- **Portal Config:** `apps/geoportal/src/app/config/portalConfig.ts`
