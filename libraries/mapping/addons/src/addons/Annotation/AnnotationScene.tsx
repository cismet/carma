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
import { applyPen, penFrom } from "./annotation-pen";
import { isAnnotationShape } from "./shape-tools";
import { sceneHasElementAt } from "./annotation-hit-test";
import { useMapSceneSync } from "./map-scene-sync";
import type { AnnotationPen } from "./annotation-pen";
import type { AnnotationShape } from "./shape-tools";
import type { SceneProbe } from "./useDrawingPicker";
import type {
  AnnotationAnchor,
  AnnotationInset,
  AnnotationSyncLimits,
} from "./types";
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
  live: boolean;
  shown: boolean;
  langCode: string;
  chrome: AnnotationSceneChrome;
  shape: AnnotationShape | null;
  /** what excalidraw switched to on its own, e.g. by a keyboard shortcut */
  onToolChange: (shape: AnnotationShape | null) => void;
  /** the pen this drawing was just used with, for all the others to take over */
  onPenChange: (pen: AnnotationPen) => void;
  /** read rather than passed, so a style tweak re-renders nothing */
  getPen: () => AnnotationPen | null;
  undoVersion: number;
  redoVersion: number;
  /** bumped when this drawing should be brought into view; 0 means never */
  zoomVersion: number;
  syncLimits: AnnotationSyncLimits;
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
  live,
  shown,
  langCode,
  chrome,
  shape,
  onToolChange,
  onPenChange,
  getPen,
  undoVersion,
  redoVersion,
  zoomVersion,
  syncLimits,
  inset,
  zIndex,
}: AnnotationSceneProps) => {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const { inSync, onSceneChange, getAnchor, reanchor } = useMapSceneSync(
    libreMap,
    api,
    box,
    editable,
    live,
    syncLimits,
    savedAnchor
  );

  const versionRef = useRef(-1);
  const fileCountRef = useRef(-1);
  const settledRef = useRef(!savedElements?.length);

  const toolRef = useRef<string | null>(null);
  /**
   * Whether this scene holds the shared pen yet. Until it does it may not
   * report anything: a scene opens on `selection` with excalidraw's own
   * styles, and it goes on saying so both before the effect below runs — React
   * defers effects past the paint — and for a commit or two after, while
   * `setActiveTool` works its way through. Reporting any of that would replace
   * the pen the user is actually holding with this scene's defaults.
   */
  const penTakenRef = useRef(false);

  const handleChange = (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles
  ) => {
    onSceneChange(appState);

    const tool = appState.activeTool.type;
    if (editable && !penTakenRef.current) {
      // the scene reporting the tool we handed it is how it confirms the pen
      penTakenRef.current = tool === toolRef.current;
    } else if (editable) {
      // keyboard shortcuts and excalidraw's own tool resets come through here
      if (tool !== toolRef.current) {
        toolRef.current = tool;
        onToolChange(isAnnotationShape(tool) ? tool : null);
      }
      onPenChange(penFrom(appState));
    }

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
      toolRef.current = shape;
      api.setActiveTool({ type: shape, locked: true });
    }
  }, [api, editable, shape]);

  /**
   * One pen for every drawing: the tool and the styles the user last worked
   * with are taken over as the pencil arrives, so nothing resets underneath
   * them. Only on arrival — while a drawing is open the scene owns them, and
   * `onPenChange` carries every change back out.
   */
  useEffect(() => {
    if (!api || !editable) {
      penTakenRef.current = false;
      return;
    }
    const pen = getPen();
    if (!pen) {
      // nothing to take over: this scene is the one that defines the pen
      penTakenRef.current = true;
      return;
    }
    toolRef.current = pen.tool;
    // a tool that was handed over has to be confirmed before this scene speaks
    penTakenRef.current = !applyPen(api, pen);
  }, [api, editable, getPen]);

  // the paper is one sheet under all the scenes, see `AnnotationOverlay`
  useEffect(() => {
    api?.updateScene({ appState: { viewBackgroundColor: "transparent" } });
  }, [api]);

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

  /**
   * The drawing held ready for the next stroke follows the camera, so whatever
   * is drawn in it starts at 100 %. It stops the moment it carries shapes:
   * element coordinates are read against the anchor, so moving it then would
   * drag the drawing across the ground. And before the saved elements have
   * landed a scene only looks untouched, hence `settledRef`.
   */
  useEffect(() => {
    if (!libreMap || !api || !editable) {
      return;
    }
    const follow = () => {
      if (
        !settledRef.current ||
        api.getSceneElements().some((element) => !element.isDeleted)
      ) {
        return;
      }
      reanchor();
    };
    follow();
    libreMap.on("moveend", follow);
    return () => {
      libreMap.off("moveend", follow);
    };
  }, [api, editable, libreMap, reanchor]);

  /**
   * The wheel belongs to the map. Excalidraw would zoom its own camera, and
   * its clamp at 10% then stops the map from following any further, so the
   * event is taken away from it and handed to maplibre's scroll zoom instead.
   */
  useEffect(() => {
    if (!box || !libreMap) {
      return;
    }
    const forward = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      libreMap.getCanvasContainer().dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaZ: event.deltaZ,
          deltaMode: event.deltaMode,
          clientX: event.clientX,
          clientY: event.clientY,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          cancelable: true,
        })
      );
    };
    box.addEventListener("wheel", forward, { capture: true, passive: false });
    return () => box.removeEventListener("wheel", forward, true);
  }, [box, libreMap]);

  // capture, so excalidraw's canvas handler never sees the click and its
  // context menu stays away
  useEffect(() => {
    if (!box) {
      return;
    }
    const swallow = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    box.addEventListener("contextmenu", swallow, true);
    return () => box.removeEventListener("contextmenu", swallow, true);
  }, [box]);

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

    const camera = libreMap.cameraForBounds(
      [
        [topLeft.lng, bottomRight.lat],
        [bottomRight.lng, topLeft.lat],
      ],
      { padding: ZOOM_PADDING, maxZoom: anchor.zoom }
    );
    if (!camera?.center) {
      return;
    }
    // never below the anchor: that zoom belongs to another drawing, and the
    // routing would hand the pencil straight over to it
    libreMap.easeTo({
      center: camera.center,
      zoom: Math.max(camera.zoom ?? anchor.zoom, anchor.zoom),
      duration: 500,
    });
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
            appState: { viewBackgroundColor: "transparent" },
          }}
        />
      </Suspense>
    </div>,
    host
  );
};
