import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Map as MaplibreMap } from "maplibre-gl";
import { DEFAULT_CONTROL_STYLE_OPTIONS } from "@carma-mapping/map-controls-layout";

/**
 * The box the preview paints into: an element of the addon's own inside the
 * map's wrapper, the way the comparison mounts its panels (see
 * `comparing/stage/CompareStage.tsx` for why not the wrapper itself). It
 * sits over the map and under the control layer, so the layer bar, the
 * information panel and the control column stay usable above the backdrop.
 */

/** above the map canvas at 0, below the controls at 1000 */
const OVERLAY_Z_INDEX = 500;

export const ObliqueOverlay = ({
  map,
  children,
  aboveControls = false,
}: {
  map: MaplibreMap;
  children: ReactNode;
  aboveControls?: boolean;
}) => {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const element = document.createElement("div");
    element.className = "carma-oblique-overlay";
    element.style.position = "absolute";
    element.style.inset = "0";
    element.style.zIndex = String(OVERLAY_Z_INDEX);
    element.style.pointerEvents = "none";
    const container = map.getContainer();
    (container.parentElement ?? container).appendChild(element);
    setHost(element);
    return () => {
      element.remove();
      setHost(null);
    };
  }, [map]);

  useEffect(() => {
    if (!host) return;
    const container = map.getContainer();
    const mapHost = container.parentElement ?? container;
    let controlsHost: HTMLElement | null = null;
    if (aboveControls) {
      let ancestor: HTMLElement | null = mapHost;
      while (ancestor) {
        if (getComputedStyle(ancestor).isolation === "isolate") {
          controlsHost = ancestor;
          break;
        }
        ancestor = ancestor.parentElement;
      }
    }
    (controlsHost ?? mapHost).appendChild(host);
    host.style.zIndex = String(
      aboveControls
        ? DEFAULT_CONTROL_STYLE_OPTIONS.layout.secondaryViewLayerZIndex + 1
        : OVERLAY_Z_INDEX
    );
  }, [map, host, aboveControls]);

  if (!host) return null;
  return createPortal(
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {children}
    </div>,
    host
  );
};
