import { Suspense, lazy, useState } from "react";
import { createPortal } from "react-dom";

import type { AddonComponentProps } from "../../lib/registry";
import { stageHostOf } from "../comparing/stage/stage-host";
import { useToolbarInset } from "../comparing/stage/useToolbarInset";
import { useExcalidrawActions } from "./excalidraw-actions";
import type { ExcalidrawInset } from "./types";
import "./excalidraw-overlay.css";

/** ~1 MB, and the geoportal build already runs near node's default heap cap */
const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then(({ Excalidraw }) => ({
    default: Excalidraw,
  }))
);

const DEFAULT_Z_INDEX = 500;
const DEFAULT_TOOLBAR_SELECTOR = "#topNavbar";
/** left: the control column; bottom: the gazetteer bar */
const DEFAULT_INSET: Required<ExcalidrawInset> = {
  top: 0,
  right: 0,
  bottom: 48,
  left: 56,
};

/**
 * A sketch layer over the map, painted into the map wrapper with a transparent
 * background.
 *
 * Screen-fixed, not georeferenced: the drawing stays where it was put while the
 * map moves under it. Anchoring it would mean driving Excalidraw's
 * `scrollX/scrollY/zoom` from every map move, which this does not do.
 *
 * Stays mounted whether or not it is drawing — unmounting would take the scene
 * with it. `excalidrawControl` flips the `excalidrawMode` channel; off means
 * view mode and `pointer-events: none`, so the map is usable again.
 *
 * The map wrapper runs the full window, behind the app's own chrome, and
 * Excalidraw pins its toolbar to the top of whatever box it gets. Hence the
 * insets, at the price of those strips not being drawable.
 */
export const ExcalidrawOverlay = ({
  config,
  libreMap,
}: AddonComponentProps<"excalidrawOverlay">) => {
  const {
    zIndex = DEFAULT_Z_INDEX,
    toolbarSelector = DEFAULT_TOOLBAR_SELECTOR,
    inset,
  } = config ?? {};
  const { top, right, bottom, left } = { ...DEFAULT_INSET, ...inset };

  const { isOn } = useExcalidrawActions();
  // in state so the measurement re-runs once the host is there
  const [host, setHost] = useState<HTMLElement | null>(null);
  // the host runs up behind the navbar, and excalidraw pins its toolbar to the
  // top of its box; flush would file the toolbar away under the bar. Measured,
  // because zen mode takes the bar away while the addon runs
  const navbarInset = useToolbarInset(host, toolbarSelector, true);

  const nextHost = libreMap ? stageHostOf(libreMap) : null;
  if (nextHost !== host) {
    setHost(nextHost);
  }

  if (!host) {
    return null;
  }

  return createPortal(
    <div
      className="carma-excalidraw-overlay"
      data-drawing={isOn ? "true" : "false"}
      style={{
        position: "absolute",
        top: navbarInset + top,
        right,
        bottom,
        left,
        zIndex,
        pointerEvents: isOn ? "auto" : "none",
      }}
    >
      <Suspense fallback={null}>
        <Excalidraw
          viewModeEnabled={!isOn}
          initialData={{ appState: { viewBackgroundColor: "transparent" } }}
        />
      </Suspense>
    </div>,
    host
  );
};
