# Cesium Engine Setup Guide

Quick setup guide for integrating the Cesium 3D engine.

## 1. Install Dependencies

```bash
npm install -D vite-plugin-static-copy
```

## 2. Configure Runtime Assets

Cesium needs Workers, Assets, and shaders copied from `node_modules/cesium`.

### Vite Apps

**Example:** [`apps/geoportal/vite.config.mts`](../../apps/geoportal/vite.config.mts)

```typescript
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [{
        src: '../../node_modules/cesium/Build/Cesium/*',
        dest: '__cesium__',
      }],
    }),
  ],
});
```

### Storybook

**Example:** [`.storybook/main.ts`](./.storybook/main.ts)

```typescript
import { viteStaticCopy } from 'vite-plugin-static-copy';

viteFinal(config) {
  return mergeConfig(config, {
    plugins: [
      viteStaticCopy({
        targets: [{
          src: '../../../../node_modules/cesium/Build/Cesium/*',
          dest: 'cesium',
        }],
      }),
    ],
  });
}
```

## 3. Configure Provider

**Example:** [`apps/geoportal/src/app/config/app.config.ts`](../../apps/geoportal/src/app/config/app.config.ts)

```typescript
import { CesiumContextProvider } from '@carma-mapping/engines/cesium';

const config: CesiumConfig = {
  // baseUrl auto-configured to /cesium (matches vite plugin dest)
  homePosition: Cartesian3.fromDegrees(7.151, 51.259, 50000),
  tilesets: [{ config: YOUR_TILESET }],
  // ... see example for full config
};

<CesiumContextProvider config={config}>
  <CesiumSceneComponent />
</CesiumContextProvider>
```

**Note:** Asset path (`/cesium`) is automatically configured to match the vite plugin!

## 4. Render the Scene

```typescript
// Simple - fills parent
<div style={{ width: '100%', height: '100vh' }}>
  <CesiumSceneComponent />
</div>

// Advanced - provide your own ref
<CesiumSceneComponent containerRef={yourRef} />
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **404 errors** `/cesium/Workers/...` | Check `vite-plugin-static-copy` config paths. Ensure `dest: 'cesium'`. Restart dev server. |
| **Black screen** | Ensure container has explicit dimensions. Check console for Cesium errors. |
| **Assets not found** | Verify vite plugin `dest` is `'cesium'` (defaults to `/cesium` URL). |

## Examples

- **Full App:** [`apps/geoportal`](../../apps/geoportal) - Production setup
- **Storybook:** [`src/lib/*.stories.tsx`](./src/lib) - Component demos  
- **Config:** [`storybook-cesium.config.ts`](./src/lib/storybook-cesium.config.ts) - Minimal config

## Advanced

- **Render Mode:** Uses `requestRenderMode: true` by default (performance optimization)
- **Manual render:** Override via `constructorOptions: { requestRenderMode: false }`
- **Events:** See main README for event system documentation
