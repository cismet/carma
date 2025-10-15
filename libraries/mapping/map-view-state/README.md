# @carma-mapping/map-view-state

**Map View State Provider** - Centralized position translation and browser navigation for map frameworks.

## Purpose

This library provides a unified provider layer between `HashProvider` and map frameworks (Cesium, Leaflet) that:

1. **Translates raw hash parameters** to typed position objects
2. **Handles browser navigation** centrally (popstate/history)
3. **Tracks 2D/3D mode** state
4. **Validates positions** before framework consumption

## Architecture

```
HashProvider (raw URL hash)
    ↓
MapViewStateProvider (this library)
    ↓
├─ Cesium (consumes 3D position objects)
└─ Leaflet (consumes 2D position objects)
```

## Adapters

### Cesium Adapter
- Converts hash params ↔ Cesium camera state (`CameraState`)
- Parameters: `lng`, `lat`, `h`, `heading`, `pitch`, `fov`
- Moved from `@carma-mapping/engines/cesium/utils/cesiumHashParamsCodec`

### Leaflet Adapter  
- Converts hash params ↔ Leaflet map state
- Parameters: `lng`, `lat`, `zoom`
- To be implemented

## Benefits

- **Single source of truth** for browser navigation
- **No hash transformation** in framework-specific hooks
- **Easier testing** - mock position objects instead of strings
- **Framework agnostic** - easy to add new map frameworks
- **Type safety** - strongly typed position objects

## Usage

```typescript
// In app root
import { MapViewStateProvider } from '@carma-mapping/map-view-state';

<HashProvider>
  <MapViewStateProvider>
    <YourMapComponent />
  </MapViewStateProvider>
</HashProvider>

// In map component
import { useMapViewState } from '@carma-mapping/map-view-state';

const { cesiumCameraState, leafletMapState } = useMapViewState();
```

## Status

🚧 **Under Development** - Created as part of Cesium context stabilization work.

See: `.dev-docs/minimal-widget-progress.md` and `.dev-docs/cesium-context-stabilization.md`
