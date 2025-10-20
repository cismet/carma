# @carma-mapping/engines/cesium/core

React wrapper for CesiumJS with scene styles, event-driven architecture, and 2D/3D transitions.

## Status

Production-ready. Used in geoportal and portals lib.

## Design decisions

- Context-based state (ref-based, no prop drilling)
- Scene style system (multiple tilesets, terrain, imagery)
- Event-driven (subscribe/emit) no rerendering for Cesium API level methods by default
- Performance optimized (request render mode)

## API

**Hooks:**
- `useCesiumContext()` - Scene ref, emit/subscribe, style state
- `useHomeControl()` - Home position
- `useZoomControls()` - Zoom controls

**Events:**
- `SetSceneStyle`, `ToggleSceneStyle`
- `SetTilesetVisibility`
- `Suspend` / `Activate` (2D/3D mode)

## Configuration

See implementations:
- `apps/geoportal/src/app/config/`
- `libraries/appframeworks/portals/`

## Setup

### 1. Copy Cesium Assets

**Required:** Add to `vite.config.mts`:

```typescript
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [{
        src: 'node_modules/cesium/Build/Cesium/*',
        dest: '__cesium__', // or 'cesium'
      }],
    }),
  ],
});
```

### 2. Configure Provider

```typescript
import { CesiumContextProvider, CesiumSceneComponent } from '@carma-mapping/engines/cesium/core';
import { Cartesian3 } from '@carma/cesium';

const config = {
  baseUrl: '/__cesium__', // must match vite dest
  initialCameraLookAt: {
    target: Cartesian3.fromDegrees(7.151, 51.259, 200),
    offset: { x: 0, y: -1000, z: 1000 },
  },
  sceneStyles: [/* your styles */],
};

<CesiumContextProvider config={config}>
  <CesiumSceneComponent />
</CesiumContextProvider>
```

**See implementation:**
- `apps/geoportal/src/app/` - Production app setup
## Resources

- [Cesium with Vite](https://community.cesium.com/t/is-there-a-good-way-to-use-cesium-with-vite/27545)
- [CesiumJS Quickstart](https://cesium.com/learn/cesiumjs-learn/cesiumjs-quickstart/)
- [Vite Plugin Cesium Build](https://github.com/s3xysteak/vite-plugin-cesium-build/)

## Related Packages

- `@carma-mapping/engines/cesium/` - see other modules for use with core here
- `@carma-mapping/map-transition-2d-3d` - 2D/3D transitions
- `@carma/resources` - Tileset/terrain definitions
