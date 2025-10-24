# @carma-mapping/engines/cesium/core

React wrapper for CesiumJS with scene styles, event-driven architecture, and 2D/3D transitions.

## Status

Production-ready. Used in geoportal and portals lib.

## Quick Start

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

## Development

For architecture details, camera initialization, and development notes, see:
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Architecture and design patterns
- [CAMERA-INITIALIZATION.md](./CAMERA-INITIALIZATION.md) - Camera initialization system
- [ARCHITECTURE-REFACTOR.md](./ARCHITECTURE-REFACTOR.md) - Provider refs migration

## Resources

- [Cesium with Vite](https://community.cesium.com/t/is-there-a-good-way-to-use-cesium-with-vite/27545)
- [CesiumJS Quickstart](https://cesium.com/learn/cesiumjs-learn/cesiumjs-quickstart/)
- [Vite Plugin Cesium Build](https://github.com/s3xysteak/vite-plugin-cesium-build/)

## Related Packages

- `@carma-mapping/engines/cesium/` - see other modules for use with core here
- `@carma-mapping/map-transition-2d-3d` - 2D/3D transitions
- `@carma/resources` - Tileset/terrain definitions
