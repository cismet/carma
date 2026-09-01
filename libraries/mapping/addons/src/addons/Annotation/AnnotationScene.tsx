import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types/types";

import { redoScene, undoScene } from "./annotation-history";
import { sceneHasElementAt } from "./annotation-hit-test";
import { useMapSceneSync } from "./map-scene-sync";
import type { AnnotationShape } from "./shape-tools";
import type { SceneProbe } from "./useDrawingPicker";
import type { AnnotationInset } from "./types";
import "./annotation-overlay.css";

const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then(({ Excalidraw }) => ({
    default: Excalidraw,
  }))
);

/** which parts of excalidraw's own chrome the css hides */
export type AnnotationSceneChrome = {
  hideMenu: boolean;
  hideZoom: boolean;
  hideTools: boolean;
  hideHelp: boolean;
  hideLibrary: boolean;
  hideHistory: boolean;
};

export type AnnotationSceneProps = {
  /** this drawing's id in the `annotationMode` channel */
  id: string;
  /** the map wrapper the overlay is painted into */
  host: HTMLElement;
  libreMap: MaplibreMap | null;
  /** hit test registration for `useDrawingPicker` */
  onProbe: (id: string, probe: SceneProbe | null) => void;
  /** the one drawing taking the pointer; the rest only follow the camera */
  editable: boolean;
  /** false while the mode is off and the config hides it then */
  shown: boolean;
  langCode: string;
  background: string;
  chrome: AnnotationSceneChrome;
  shape: AnnotationShape;
  undoVersion: number;
  redoVersion: number;
  inset: Required<AnnotationInset>;
  zIndex: number;
};

/**
 * One drawing. `useMapSceneSync` takes its anchor off the map on mount, so a
 * scene added later is pinned at the current camera — that is what allows
 * drawing again after zooming past an older drawing's range.
 *
 * Stays mounted whether or not it is being drawn on: unmounting would drop the
 * scene, and the sync must keep running while the map moves.
 */
export const AnnotationScene = ({
  id,
  host,
  libreMap,
  onProbe,
  editable,
  shown,
  langCode,
  background,
  chrome,
  shape,
  undoVersion,
  redoVersion,
  inset,
  zIndex,
}: AnnotationSceneProps) => {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const { inSync, onSceneChange } = useMapSceneSync(
    libreMap,
    api,
    box,
    editable
  );

  useEffect(() => {
    if (api && editable && shape) {
      api.setActiveTool({ type: shape, locked: true });
    }
  }, [api, editable, shape]);

  // only the editable scene paints a background; stacked ones would tint the
  // map once per drawing
  useEffect(() => {
    api?.updateScene({
      appState: {
        viewBackgroundColor: editable ? background : "transparent",
      },
    });
  }, [api, background, editable]);

  useEffect(() => {
    onProbe(id, (clientX, clientY) =>
      sceneHasElementAt(api, box, clientX, clientY)
    );
    return () => onProbe(id, null);
  }, [api, box, id, onProbe]);

  const historyRef = useRef({ undoVersion, redoVersion });
  useEffect(() => {
    const previous = historyRef.current;
    historyRef.current = { undoVersion, redoVersion };
    if (!editable) {
      return;
    }
    const container = box?.querySelector<HTMLElement>(".excalidraw") ?? null;
    if (undoVersion > previous.undoVersion) {
      undoScene(container);
    }
    if (redoVersion > previous.redoVersion) {
      redoScene(container);
    }
  }, [box, editable, redoVersion, undoVersion]);

  const drawing = editable && inSync;

  return createPortal(
    <div
      ref={setBox}
      className="carma-annotation-overlay"
      data-drawing={drawing ? "true" : "false"}
      data-hide-menu={chrome.hideMenu ? "true" : "false"}
      data-hide-zoom={chrome.hideZoom ? "true" : "false"}
      data-hide-tools={chrome.hideTools ? "true" : "false"}
      data-hide-help={chrome.hideHelp ? "true" : "false"}
      data-hide-library={chrome.hideLibrary ? "true" : "false"}
      data-hide-history={chrome.hideHistory ? "true" : "false"}
      style={{
        position: "absolute",
        top: inset.top,
        right: inset.right,
        bottom: inset.bottom,
        left: inset.left,
        zIndex,
        pointerEvents: drawing ? "auto" : "none",
        // not `display: none`: the sync measures its offset off this box
        visibility: inSync && shown ? "visible" : "hidden",
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
              viewBackgroundColor: editable ? background : "transparent",
            },
          }}
        />
      </Suspense>
    </div>,
    host
  );
};
