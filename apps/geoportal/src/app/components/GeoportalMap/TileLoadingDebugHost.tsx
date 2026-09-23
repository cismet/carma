import {
  lazy,
  Suspense,
  useCallback,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import type { Map as MaplibreMap } from "maplibre-gl";
import { useAddonState } from "@carma-mapping/addons";

import { useFeatureFlags } from "@carma-providers/feature-flag";
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

/** Shadow options or the explicit debug feature flag expose the same overlay. */
export const TileLoadingDebugHost = ({ map }: { map: MaplibreMap | null }) => {
  const [shadowState, setShadowState] = useAddonState("shadowSimulation");
  const { isDebugMode } = useFeatureFlags();
  const [meshOpen, setMeshOpen] = useState(true);
  const runtimeHandle = useSyncExternalStore(
    useCallback(
      (listener: () => void) =>
        map ? subscribeTiles3dRuntimeHandles(map, listener) : () => {},
      [map]
    ),
    useCallback(
      () => (map ? getTiles3dRuntimeHandles(map)[0] ?? null : null),
      [map]
    )
  );
  const meshControls = isDebugMode && !!runtimeHandle;
  const open = !!shadowState?.showTileDiagnostics || (meshControls && meshOpen);
  const container = map?.getContainer?.() ?? null;
  if ((!open && !meshControls) || !map || !container) return null;
  const close = () => {
    setMeshOpen(false);
    if (shadowState?.showTileDiagnostics)
      setShadowState({ ...shadowState, showTileDiagnostics: false });
  };
  return createPortal(
    <div
      data-test-id="tile-diagnostics-overlay-root"
      style={OVERLAY_ROOT_STYLE}
    >
      <div data-test-id="tile-diagnostics-anchor" style={OVERLAY_ANCHOR_STYLE}>
        {open && !runtimeHandle && (
          <Suspense fallback={null}>
            <LazyVolumeTileDiagnostics map={map} onClose={close} />
          </Suspense>
        )}
      </div>
      {runtimeHandle && (meshControls || open) && (
        <Suspense fallback={null}>
          <LazyTileLoadingDebug
            map={map}
            runtimeHandle={runtimeHandle}
            open={open}
            onOpenChange={(value) => {
              if (value) setMeshOpen(true);
              else close();
            }}
            initialToolbarPosition={{ left: 56, top: 88 }}
            initialOverviewPosition={{ left: 56, top: 144 }}
            options={{
              showOverviewPanel: true,
              showCharts: isDebugMode,
              showOverlay: false,
              showLegend: false,
              overlayLabels: "id and stats",
            }}
          />
        </Suspense>
      )}
    </div>,
    container
  );
};
