import { lazy, Suspense, useCallback, useSyncExternalStore } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { useDevelopmentUiEnabled } from "@carma-appframeworks/portals";
import { useAddonState } from "@carma-mapping/addons";
import {
  getTiles3dRuntimeHandles,
  subscribeTiles3dRuntimeHandles,
} from "@carma-mapping/engines/maplibre";

const LazyTileLoadingDebug = lazy(() =>
  import("@carma-mapping/tile-diagnostics-ui").then((module) => ({
    default: module.TileLoadingDebug,
  }))
);

const NO_HANDLES: ReturnType<typeof getTiles3dRuntimeHandles> = [];

/**
 * Development UI only: the tile manager debugger of the mapping stories for
 * the mounted mesh (or the first 3D Tiles layer). Nothing of it is loaded
 * without the development UI or without a runtime.
 */
export const TileLoadingDebugHost = ({ map }: { map: MaplibreMap | null }) => {
  const developmentUi = useDevelopmentUiEnabled();
  const [shadowState, setShadowState] = useAddonState("shadowSimulation");
  // The shadow panel offers the diagnostics directly, so its switch opens them
  // even where the development UI is not on.
  const requested = shadowState?.showTileDiagnostics === true;
  const enabled = developmentUi || requested;
  const subscribe = useCallback(
    (listener: () => void) =>
      map ? subscribeTiles3dRuntimeHandles(map, listener) : () => undefined,
    [map]
  );
  const getHandles = useCallback(
    () => (map ? getTiles3dRuntimeHandles(map) : NO_HANDLES),
    [map]
  );
  const handles = useSyncExternalStore(subscribe, getHandles, getHandles);
  const runtime =
    handles.find((handle) => handle.scene.providesTerrain) ??
    handles[0] ??
    null;
  if (!enabled || !map || !runtime) return null;
  return (
    <Suspense fallback={null}>
      <LazyTileLoadingDebug
        map={map}
        runtimeHandle={runtime}
        open={requested ? true : undefined}
        onOpenChange={(open) => {
          if (!shadowState || open === requested) return;
          setShadowState({ ...shadowState, showTileDiagnostics: open });
        }}
      />
    </Suspense>
  );
};
