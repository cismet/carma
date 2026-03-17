# hash-state

Hash state provider for URL-based application state management.

## Scene descriptor hash helpers

The package includes pure scene-descriptor hash helpers for the shared CARMA URL contract plus engine adapters that can sample scene state into that shared format.

- supported URL encoding schemes:
  - `carma-maplibre-plus-elevation` (`lat/lng/zoom/bearing/pitch/h`, MapLibre-style pitch with added elevation) ← CARMA standard map URL query scheme for cross-engine sharing
- legacy compact `camera3d` / `c3` hashes are only decoded in the dedicated initial-camera adapter path

Default shared CARMA map URL aliases are:

- `lat`
- `lng`
- `zoom`
- optional `b` (`bearing`)
- optional `p` (`pitch`)
- optional `h` (`altitude`)
- optional `fov`

Typical usage (direct 3D scene sampling):

```tsx
import {
  HashStateProvider,
  useSceneStateHashSync,
} from "@carma-providers/hash-state";

function SceneHashSync({ scene }: { scene: unknown }) {
  useSceneStateHashSync({
    scene: scene as any,
    encodeScheme: "carma-maplibre-plus-elevation",
    anchorMode: "screen-center", // samples center once per camera move event
    fallbackHeightM: 200,
    replace: true,
  });
  return null;
}
```

Typical usage (with a scene-state provider):

```tsx
import {
  HashStateProvider,
  useSceneStateHashSync,
} from "@carma-providers/hash-state";
import { useCesiumSceneStateOptional } from "@carma-mapping/engines/cesium/react/scene-state";

function SceneHashSyncFromSceneState() {
  const sceneState = useCesiumSceneStateOptional();
  useSceneStateHashSync({
    sceneState,
    encodeScheme: "carma-maplibre-plus-elevation",
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
- When `sceneState` is provided, hash updates use the already computed shared scene-state adapter
  instead of querying the underlying engine internals again.

## Running unit tests

Run `nx test hash-state` to execute the unit tests via [Vitest](https://vitest.dev/).
