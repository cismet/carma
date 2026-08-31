import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types/types";

import type { AddonComponentProps } from "../../lib/registry";
import { stageHostOf } from "../comparing/stage/stage-host";
import { useToolbarInset } from "../comparing/stage/useToolbarInset";
import { useAnnotationActions } from "./annotation-actions";
import { useMapSceneSync } from "./map-scene-sync";
import { redoScene, undoScene } from "./annotation-history";
import type { AnnotationInset } from "./types";
import "./annotation-overlay.css";

const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then(({ Excalidraw }) => ({
    default: Excalidraw,
  }))
);

const DEFAULT_Z_INDEX = 500;
const DEFAULT_TOOLBAR_SELECTOR = "#topNavbar";
const DEFAULT_LANG_CODE = "de-DE";
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

const DEFAULT_INSET: Required<AnnotationInset> = {
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
 * `annotationControl` flips the `annotationMode` channel; off means view mode
 * and `pointer-events: none`.
 *
 * The map wrapper runs the full window, behind the app's own chrome, and
 * excalidraw pins its toolbar to the top of whatever box it gets. Hence the
 * insets, at the price of those strips not being drawable.
 */
export const AnnotationOverlay = ({
  config,
  libreMap,
}: AddonComponentProps<"annotationOverlay">) => {
  const {
    zIndex = DEFAULT_Z_INDEX,
    toolbarSelector = DEFAULT_TOOLBAR_SELECTOR,
    inset,
    langCode = DEFAULT_LANG_CODE,
    hideMenu = false,
    hideZoom = false,
    hideTools = false,
    hideHelp = false,
    hideLibrary = false,
    hideHistory = false,
    hideWhenOff = false,
    background = DEFAULT_BACKGROUND,
    backgroundOpacity = DEFAULT_BACKGROUND_OPACITY,
  } = config ?? {};
  const { top, right, bottom, left } = { ...DEFAULT_INSET, ...inset };

  const { isOn, shape, undoVersion, redoVersion } = useAnnotationActions();
  // in state so the measurement re-runs once the host is there
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  // flush to the host would file the toolbar away behind the navbar. Measured,
  // because zen mode takes the bar away while the addon runs
  const navbarInset = useToolbarInset(host, toolbarSelector, true);
  const { inSync, onSceneChange } = useMapSceneSync(libreMap, api, box);

  useEffect(() => {
    if (api && shape) {
      api.setActiveTool({ type: shape, locked: true });
    }
  }, [api, shape]);

  const historyRef = useRef({ undoVersion, redoVersion });
  useEffect(() => {
    const previous = historyRef.current;
    historyRef.current = { undoVersion, redoVersion };
    const container = box?.querySelector<HTMLElement>(".excalidraw") ?? null;
    if (undoVersion > previous.undoVersion) {
      undoScene(container);
    }
    if (redoVersion > previous.redoVersion) {
      redoScene(container);
    }
  }, [box, redoVersion, undoVersion]);

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
      className="carma-annotation-overlay"
      data-drawing={drawing ? "true" : "false"}
      data-hide-menu={hideMenu ? "true" : "false"}
      data-hide-zoom={hideZoom ? "true" : "false"}
      data-hide-tools={hideTools ? "true" : "false"}
      data-hide-help={hideHelp ? "true" : "false"}
      data-hide-library={hideLibrary ? "true" : "false"}
      data-hide-history={hideHistory ? "true" : "false"}
      style={{
        position: "absolute",
        top: navbarInset + top,
        right,
        bottom,
        left,
        zIndex,
        pointerEvents: drawing ? "auto" : "none",
        // not `display: none`: the sync measures its offset off this box
        visibility: inSync && (drawing || !hideWhenOff) ? "visible" : "hidden",
      }}
    >
      <Suspense fallback={null}>
        <Excalidraw
          excalidrawAPI={setApi}
          onChange={(_elements, appState: AppState) => onSceneChange(appState)}
          langCode={langCode}
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
