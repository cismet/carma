import { Suspense, lazy, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types/types";

import type { AddonComponentProps } from "../../lib/registry";
import { stageHostOf } from "../comparing/stage/stage-host";
import { useToolbarInset } from "../comparing/stage/useToolbarInset";
import { useExcalidrawActions } from "./excalidraw-actions";
import { useMapSceneSync } from "./map-scene-sync";
import type { ExcalidrawInset } from "./types";
import "./excalidraw-overlay.css";

const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then(({ Excalidraw }) => ({
    default: Excalidraw,
  }))
);

const DEFAULT_Z_INDEX = 500;
const DEFAULT_TOOLBAR_SELECTOR = "#topNavbar";
const DEFAULT_BACKGROUND = "#fffce8";
const DEFAULT_BACKGROUND_OPACITY = 0.5;

const withAlpha = (color: string, opacity: number) => {
  const alpha = Math.round(Math.min(Math.max(opacity, 0), 1) * 255);
  if (alpha === 255) {
    return color;
  }
  return /^#[0-9a-f]{6}$/i.test(color)
    ? `${color}${alpha.toString(16).padStart(2, "0")}`
    : color;
};

const DEFAULT_INSET: Required<ExcalidrawInset> = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

/**
 * A georeferenced sketch layer: excalidraw painted into the map wrapper over
 * the map, pinned to the ground by `useMapSceneSync`.
 *
 * Stays mounted whether or not it is drawing — unmounting would take the scene
 * with it, and the sync has to keep running while the map moves.
 * `excalidrawControl` flips the `excalidrawMode` channel; off means view mode
 * and `pointer-events: none`.
 *
 * The map wrapper runs the full window, behind the app's own chrome, and
 * excalidraw pins its toolbar to the top of whatever box it gets. Hence the
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
    hideMenu = false,
    hideZoom = false,
    background = DEFAULT_BACKGROUND,
    backgroundOpacity = DEFAULT_BACKGROUND_OPACITY,
  } = config ?? {};
  const { top, right, bottom, left } = { ...DEFAULT_INSET, ...inset };

  const { isOn } = useExcalidrawActions();
  // in state so the measurement re-runs once the host is there
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  // flush to the host would file the toolbar away behind the navbar. Measured,
  // because zen mode takes the bar away while the addon runs
  const navbarInset = useToolbarInset(host, toolbarSelector, true);
  const { inSync, onSceneChange } = useMapSceneSync(libreMap, api, box);

  const nextHost = libreMap ? stageHostOf(libreMap) : null;
  if (nextHost !== host) {
    setHost(nextHost);
  }

  if (!host) {
    return null;
  }

  const drawing = isOn && inSync;

  return createPortal(
    <div
      ref={setBox}
      className="carma-excalidraw-overlay"
      data-drawing={drawing ? "true" : "false"}
      data-hide-menu={hideMenu ? "true" : "false"}
      data-hide-zoom={hideZoom ? "true" : "false"}
      style={{
        position: "absolute",
        top: navbarInset + top,
        right,
        bottom,
        left,
        zIndex,
        pointerEvents: drawing ? "auto" : "none",
        // not `display: none`: the sync measures its offset off this box
        visibility: inSync ? "visible" : "hidden",
      }}
    >
      <Suspense fallback={null}>
        <Excalidraw
          excalidrawAPI={setApi}
          onChange={(_elements, appState: AppState) => onSceneChange(appState)}
          viewModeEnabled={!drawing}
          initialData={{
            appState: {
              viewBackgroundColor: withAlpha(background, backgroundOpacity),
            },
          }}
        />
      </Suspense>
    </div>,
    host
  );
};
