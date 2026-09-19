import {
  lazy,
  Suspense,
  useCallback,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
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

const LazyVolumeTileDiagnostics = lazy(() =>
  import("@carma-mapping/tile-diagnostics-ui").then((module) => ({
    default: module.VolumeTileDiagnostics,
  }))
);

const NO_HANDLES: ReturnType<typeof getTiles3dRuntimeHandles> = [];

/**
 * One overlay root inside the map container, the level the annotation runtime
 * mounts its own overlays on: the diagnostics scroll, resize and clip with the
 * map, and nothing of them can reach the app's layout.
 */
const OVERLAY_ROOT_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  isolation: "isolate",
  zIndex: 120,
};

/** Clear of the map's own control column, where the toolbar used to sit. */
const OVERLAY_ANCHOR_STYLE: CSSProperties = {
  position: "absolute",
  left: 56,
  top: 88,
  pointerEvents: "auto",
};

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
  const container = map?.getContainer?.() ?? null;
  if (!enabled || !map || !container) return null;
  const content = runtime ? (
    <LazyTileLoadingDebug
      map={map}
      runtimeHandle={runtime}
      open={requested ? true : undefined}
      onOpenChange={(open) => {
        if (!shadowState || open === requested) return;
        setShadowState({ ...shadowState, showTileDiagnostics: open });
      }}
    />
  ) : requested ? (
    // No 3D Tiles tree to attach to, terrain-only sessions above all: the
    // overview then stands on the tile boxes the runtimes report, so the
    // switch never opens onto nothing.
    <LazyVolumeTileDiagnostics
      map={map}
      onClose={() => {
        if (shadowState)
          setShadowState({ ...shadowState, showTileDiagnostics: false });
      }}
    />
  ) : null;
  if (!content) return null;
  return createPortal(
    <div
      data-test-id="tile-diagnostics-overlay-root"
      style={OVERLAY_ROOT_STYLE}
    >
      <div
        data-test-id={
          runtime
            ? "tile-diagnostics-anchor"
            : "tile-diagnostics-without-tileset"
        }
        style={OVERLAY_ANCHOR_STYLE}
      >
        <Suspense fallback={null}>{content}</Suspense>
      </div>
    </div>,
    container
  );
};
