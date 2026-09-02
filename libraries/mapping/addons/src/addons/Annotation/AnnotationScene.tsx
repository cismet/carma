import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";

import { redoScene, undoScene } from "./annotation-history";
import { sceneHasElementAt } from "./annotation-hit-test";
import { useMapSceneSync } from "./map-scene-sync";
import type { AnnotationShape } from "./shape-tools";
import type { SceneProbe } from "./useDrawingPicker";
import type { AnnotationAnchor, AnnotationInset } from "./types";
import "./annotation-overlay.css";

const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then(({ Excalidraw }) => ({
    default: Excalidraw,
  }))
);

let getSceneVersion:
  | ((elements: readonly ExcalidrawElement[]) => number)
  | null = null;
void import("@excalidraw/excalidraw").then((module) => {
  getSceneVersion = module.getSceneVersion;
});

export type AnnotationSceneChrome = {
  hideMenu: boolean;
  hideZoom: boolean;
  hideTools: boolean;
  hideHelp: boolean;
  hideLibrary: boolean;
  hideHistory: boolean;
};

export type AnnotationSceneProps = {
  id: string;
  host: HTMLElement;
  libreMap: MaplibreMap | null;
  onProbe: (id: string, probe: SceneProbe | null) => void;
  onSceneEdit: (
    id: string,
    elements: readonly ExcalidrawElement[],
    anchor: AnnotationAnchor | null
  ) => void;
  savedElements?: readonly ExcalidrawElement[];
  savedAnchor?: AnnotationAnchor;
  editable: boolean;
  live: boolean;
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

export const AnnotationScene = ({
  id,
  host,
  libreMap,
  onProbe,
  onSceneEdit,
  savedElements,
  savedAnchor,
  editable,
  live,
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
  const { inSync, onSceneChange, getAnchor } = useMapSceneSync(
    libreMap,
    api,
    box,
    editable,
    live,
    savedAnchor
  );

  const versionRef = useRef(-1);
  const settledRef = useRef(!savedElements?.length);

  const handleChange = (
    elements: readonly ExcalidrawElement[],
    appState: AppState
  ) => {
    onSceneChange(appState);

    if (!settledRef.current) {
      if (elements.length === 0) {
        return;
      }
      settledRef.current = true;
    }

    const version = getSceneVersion?.(elements) ?? -1;
    if (version === versionRef.current) {
      return;
    }
    versionRef.current = version;
    onSceneEdit(id, elements, getAnchor());
  };

  useEffect(() => {
    if (api && editable && shape) {
      api.setActiveTool({ type: shape, locked: true });
    }
  }, [api, editable, shape]);

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
        visibility: inSync && shown ? "visible" : "hidden",
      }}
    >
      <Suspense fallback={null}>
        <Excalidraw
          excalidrawAPI={setApi}
          onChange={handleChange}
          langCode={langCode}
          viewModeEnabled={!drawing}
          initialData={{
            elements: savedElements,
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
