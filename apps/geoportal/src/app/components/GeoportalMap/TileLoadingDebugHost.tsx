import { lazy, Suspense, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Map as MaplibreMap } from "maplibre-gl";
import { useAddonState } from "@carma-mapping/addons";

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

/** The shadow options and their URL state are the only overlay entrypoints. */
export const TileLoadingDebugHost = ({ map }: { map: MaplibreMap | null }) => {
  const [shadowState, setShadowState] = useAddonState("shadowSimulation");
  const container = map?.getContainer?.() ?? null;
  if (!shadowState?.showTileDiagnostics || !map || !container) return null;
  return createPortal(
    <div
      data-test-id="tile-diagnostics-overlay-root"
      style={OVERLAY_ROOT_STYLE}
    >
      <div data-test-id="tile-diagnostics-anchor" style={OVERLAY_ANCHOR_STYLE}>
        <Suspense fallback={null}>
          <LazyVolumeTileDiagnostics
            map={map}
            onClose={() =>
              setShadowState({ ...shadowState, showTileDiagnostics: false })
            }
          />
        </Suspense>
      </div>
    </div>,
    container
  );
};
