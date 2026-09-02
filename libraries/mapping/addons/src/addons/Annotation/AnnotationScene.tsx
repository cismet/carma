import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  AppState,
  BinaryFiles,
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

/** keeps a zoomed-to drawing clear of the map chrome, in px */
const ZOOM_PADDING = 80;

/** how far the drawings that are not picked step back, while the mode is on */
const INACTIVE_OPACITY = 0.45;

type SceneBox = { minX: number; minY: number; maxX: number; maxY: number };

const sceneBounds = (
  elements: readonly ExcalidrawElement[]
): SceneBox | null => {
  const box = elements.reduce<SceneBox | null>((current, element) => {
    if (element.isDeleted) {
      return current;
    }
    const minX = Math.min(element.x, element.x + element.width);
    const minY = Math.min(element.y, element.y + element.height);
    const maxX = Math.max(element.x, element.x + element.width);
    const maxY = Math.max(element.y, element.y + element.height);
    return current
      ? {
          minX: Math.min(current.minX, minX),
          minY: Math.min(current.minY, minY),
          maxX: Math.max(current.maxX, maxX),
          maxY: Math.max(current.maxY, maxY),
        }
      : { minX, minY, maxX, maxY };
  }, null);
  // a single point would make fitBounds pick an arbitrary zoom
  return box
    ? box.maxX - box.minX < 1 && box.maxY - box.minY < 1
      ? {
          minX: box.minX - 50,
          minY: box.minY - 50,
          maxX: box.maxX + 50,
          maxY: box.maxY + 50,
        }
      : box
    : null;
};

const referencedFiles = (
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles
): BinaryFiles => {
  const ids = new Set(
    elements
      .filter((element) => !element.isDeleted)
      .map((element) => (element as { fileId?: string | null }).fileId)
      .filter((fileId): fileId is string => Boolean(fileId))
  );
  const kept: BinaryFiles = {};
  Object.keys(files).forEach((fileId) => {
    if (ids.has(fileId)) {
      kept[fileId] = files[fileId];
    }
  });
  return kept;
};

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
    files: BinaryFiles,
    anchor: AnnotationAnchor | null
  ) => void;
  savedElements?: readonly ExcalidrawElement[];
  savedFiles?: BinaryFiles;
  savedAnchor?: AnnotationAnchor;
  editable: boolean;
  /** the drawing the toolbar points at, locked or not */
  active: boolean;
  live: boolean;
  shown: boolean;
  langCode: string;
  background: string;
  chrome: AnnotationSceneChrome;
  shape: AnnotationShape;
  undoVersion: number;
  redoVersion: number;
  /** bumped when this drawing should be brought into view; 0 means never */
  zoomVersion: number;
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
  savedFiles,
  savedAnchor,
  editable,
  active,
  live,
  shown,
  langCode,
  background,
  chrome,
  shape,
  undoVersion,
  redoVersion,
  zoomVersion,
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
  const fileCountRef = useRef(-1);
  const settledRef = useRef(!savedElements?.length);

  const handleChange = (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles
  ) => {
    onSceneChange(appState);

    if (!settledRef.current) {
      if (elements.length === 0) {
        return;
      }
      settledRef.current = true;
    }

    const version = getSceneVersion?.(elements) ?? -1;
    const used = referencedFiles(elements, files);
    const fileCount = Object.keys(used).length;
    if (version === versionRef.current && fileCount === fileCountRef.current) {
      return;
    }
    versionRef.current = version;
    fileCountRef.current = fileCount;
    onSceneEdit(id, elements, used, getAnchor());
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

  const zoomRef = useRef(zoomVersion);
  useEffect(() => {
    const previous = zoomRef.current;
    zoomRef.current = zoomVersion;
    if (zoomVersion <= previous || !api || !libreMap) {
      return;
    }
    const anchor = getAnchor();
    if (!anchor) {
      return;
    }
    const bounds = sceneBounds(api.getSceneElements());
    if (!bounds) {
      return;
    }

    // scene units are map pixels at the anchor zoom, measured from the anchor
    const scale = 2 ** (libreMap.getZoom() - anchor.zoom);
    const origin = libreMap.project([anchor.lng, anchor.lat]);
    const at = (x: number, y: number) =>
      libreMap.unproject([origin.x + x * scale, origin.y + y * scale]);
    const topLeft = at(bounds.minX, bounds.minY);
    const bottomRight = at(bounds.maxX, bounds.maxY);

    libreMap.fitBounds(
      [
        [topLeft.lng, bottomRight.lat],
        [bottomRight.lng, topLeft.lat],
      ],
      { padding: ZOOM_PADDING, maxZoom: anchor.zoom, duration: 500 }
    );
  }, [api, getAnchor, libreMap, zoomVersion]);

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
        // the picked drawing keeps its colors, the others step back. Off the
        // mode there is nothing to pick, so they all stay as drawn
        opacity: !live || active ? 1 : INACTIVE_OPACITY,
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
            files: savedFiles,
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
