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
  if (!enabled || !map) return null;
  // Asked for, but nothing to inspect: say so where the toolbar would sit,
  // instead of leaving the button looking broken. The terrain runtime is not
  // a 3D Tiles runtime yet, so terrain alone has no diagnostics.
  if (!runtime)
    return requested ? (
      <div
        data-test-id="tile-diagnostics-unavailable"
        style={{
          position: "fixed",
          left: 64,
          top: 96,
          zIndex: 6000,
          padding: "4px 8px",
          borderRadius: 4,
          background: "rgba(0,0,0,0.72)",
          color: "#fff",
          font: "12px/1.4 system-ui, sans-serif",
          pointerEvents: "none",
        }}
      >
        Kachel-Diagnose: kein 3D-Tileset geladen
      </div>
    ) : null;
  return (
    // The toolbar positions itself absolutely; this anchor puts it beside the
    // map's own control column instead of behind it, and keeps it above the
    // map without covering it.
    <div
      style={{
        position: "fixed",
        left: 64,
        top: 96,
        width: 0,
        height: 0,
        zIndex: 6000,
      }}
    >
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
    </div>
  );
};
