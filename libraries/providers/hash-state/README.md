# hash-state

Hash state provider for URL-based application state management.

## Cesium Camera Plugin

The package now includes an object-centric Cesium camera hash codec + sync hook:

- `camera3d` hash key (default alias: `c3`)
- value decodes to:
  - `anchor: { lngDeg, latDeg, heightM, source }`
  - `orientation: { headingDeg, pitchDeg, rollDeg, fovDeg, rangeM }`
- supported URL encoding schemes:
  - `carma-object-centric` (compact `c3` only)
  - `carma-camera-centric` (`lat/lng/h/heading/pitch/fov`)
  - `maplibre-object-centric` (`lat/lng/zoom/bearing/pitch`, no custom keys)
  - `maplibre-camera-centric` (`lat/lng/zoom/bearing/pitch` from camera position, no custom keys)

Typical usage (direct scene/camera sampling):

```tsx
import {
  HashStateProvider,
  createCesiumCameraHashConfig,
  useCesiumCameraHashPlugin,
} from "@carma-providers/hash-state";

function CesiumHashSync({ scene }: { scene: unknown }) {
  useCesiumCameraHashPlugin({
    scene: scene as any,
    encodeScheme: "carma-object-centric",
    anchorMode: "screen-center", // samples center once per camera move event
    fallbackHeightM: 200,
    replace: true,
  });
  return null;
}

const cameraHash = createCesiumCameraHashConfig();
// Example composition:
// <HashStateProvider
//   keyAliases={{ ...defaultHashKeyAliases, ...cameraHash.keyAliases }}
//   keyOrder={[...cameraHash.keyOrder, ...defaultHashKeyOrder]}
//   hashCodecs={{ ...defaultHashCodecs, ...cameraHash.hashCodecs }}
// >
//   ...
// </HashStateProvider>
```

Typical usage (with `CesiumSceneStateProvider`):

```tsx
import {
  HashStateProvider,
  createCesiumCameraHashConfig,
  useCesiumCameraHashPlugin,
} from "@carma-providers/hash-state";
import { useCesiumSceneStateOptional } from "@carma-mapping/engines/cesium/react/scene-state";

function CesiumHashSyncFromSceneState() {
  const sceneState = useCesiumSceneStateOptional();
  useCesiumCameraHashPlugin({
    sceneState,
    encodeScheme: "carma-object-centric",
    anchorMode: "screen-center",
    fallbackHeightM: 200,
    replace: true,
  });
  return null;
}
```

Notes:

- No dedicated terrain provider is required for basic operation.
- Center sampling tries `scene.pickPosition` first, then `globe.pick`.
- If no center hit is available, it falls back to camera position with `fallbackHeightM`.
- When `sceneState` is provided, hash updates use the already computed scene-state snapshot
  instead of querying Cesium internals again.

## Running unit tests

Run `nx test hash-state` to execute the unit tests via [Vitest](https://vitest.dev/).
