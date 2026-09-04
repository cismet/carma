import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types/types";

import type { AddonComponentProps } from "../../lib/registry";
import { stageHostOf } from "../comparing/stage/stage-host";
import { useToolbarInset } from "../comparing/stage/useToolbarInset";
import { reserveIdSequence, useAnnotationActions } from "./annotation-actions";
import { highestIdSequence, readAnnotations } from "./annotation-storage";
import { anchorZoomOf, originOf, spanOf } from "./annotation-zoom-bands";
import { useBandRouting } from "./useBandRouting";
import { AnnotationScene } from "./AnnotationScene";
import { useAnnotationStorage } from "./useAnnotationStorage";
import { useDrawingPicker } from "./useDrawingPicker";
import type {
  AnnotationAnchor,
  AnnotationInset,
  AnnotationSyncLimits,
} from "./types";

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

/**
 * The scale window a drawing is drawn in, in percent; see `AnnotationZoomRange`.
 * 100% to 400% keeps strokes between crisp and bold, and makes each drawing two
 * zoom levels wide. Excalidraw itself renders from 10% to 3000%, so those are
 * the outer bounds worth configuring.
 */
const DEFAULT_ZOOM_RANGE = { min: 100, max: 400 };

/** nothing hides the drawing by default; see `AnnotationSyncLimits` */
const DEFAULT_SYNC_LIMITS: AnnotationSyncLimits = {};

const DEFAULT_INSET: Required<AnnotationInset> = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

/**
 * The georeferenced sketch layer: one excalidraw scene per drawing, portalled
 * into the map wrapper and pinned to the ground by `useMapSceneSync`.
 *
 * Each drawing has its own anchor, so a new one starts at the current camera
 * while the older ones stay where they were drawn. `annotationControl` flips
 * the `annotationMode` channel; off means view mode and `pointer-events: none`.
 *
 * The map wrapper spans the window behind the app chrome, and excalidraw pins
 * its toolbar to the top of whatever box it gets — hence the insets, at the
 * cost of those strips not being drawable.
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
    storageKey,
    syncLimits,
    zoomRange,
    background = DEFAULT_BACKGROUND,
    backgroundOpacity = DEFAULT_BACKGROUND_OPACITY,
  } = config ?? {};
  const { top, right, bottom, left } = { ...DEFAULT_INSET, ...inset };

  const {
    isOn,
    isLocked,
    groups,
    activeId,
    shape,
    undoVersion,
    redoVersion,
    zoomRequest,
    zoomOrigin,
    pickGroup,
    setShape,
    addGroup,
    assignBand,
    setZoomOrigin,
    hydrate,
  } = useAnnotationActions();

  const scales = useMemo(
    () => ({
      min: (zoomRange?.min ?? DEFAULT_ZOOM_RANGE.min) / 100,
      max: (zoomRange?.max ?? DEFAULT_ZOOM_RANGE.max) / 100,
    }),
    [zoomRange?.max, zoomRange?.min]
  );
  const span = useMemo(() => spanOf(scales), [scales]);

  const [{ origin: savedOrigin, drawings: saved }] = useState(() =>
    readAnnotations(storageKey)
  );
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) {
      return;
    }
    hydratedRef.current = true;
    if (saved.length === 0) {
      return;
    }
    reserveIdSequence(highestIdSequence(saved));
    hydrate(
      saved.map(({ id, band }) => ({ id, band, locked: true })),
      savedOrigin
    );
  }, [hydrate, saved, savedOrigin]);

  const storeSceneEdit = useAnnotationStorage({
    storageKey,
    groups,
    restored: saved,
    origin: zoomOrigin,
  });

  /** which drawings carry shapes, so the router leaves their anchors alone */
  const filledRef = useRef(new Set(saved.map((drawing) => drawing.id)));
  const isFilled = useCallback((id: string) => filledRef.current.has(id), []);

  const onSceneEdit = useCallback(
    (
      id: string,
      elements: readonly ExcalidrawElement[],
      files: BinaryFiles,
      anchor: AnnotationAnchor | null
    ) => {
      storeSceneEdit(id, elements, files, anchor);
      const filled = elements.some((element) => !element.isDeleted);
      if (filled) {
        filledRef.current.add(id);
      } else {
        filledRef.current.delete(id);
      }
      // the first stroke decides where the user works, and cuts the grid that
      // every later drawing gets its band from
      if (filled && anchor && zoomOrigin === undefined) {
        setZoomOrigin(originOf(anchor.zoom, scales.min));
        assignBand(id, 0);
      }
    },
    [assignBand, scales.min, setZoomOrigin, storeSceneEdit, zoomOrigin]
  );

  useBandRouting({
    libreMap,
    enabled: isOn,
    groups,
    activeId,
    origin: zoomOrigin,
    span,
    isFilled,
    pickGroup,
    assignBand,
    addGroup,
  });
  // in state so the measurement re-runs once the host is there
  const [host, setHost] = useState<HTMLElement | null>(null);
  // flush to the host would file the toolbar away behind the navbar. Measured,
  // because zen mode takes the bar away while the addon runs
  const navbarInset = useToolbarInset(host, toolbarSelector, true);

  const order = useMemo(() => groups.map((group) => group.id), [groups]);
  const registerProbe = useDrawingPicker({
    host,
    enabled: isOn,
    order,
    activeId,
    armed: isLocked || shape === "selection",
    onPick: pickGroup,
  });

  const nextHost = libreMap ? stageHostOf(libreMap) : null;
  if (nextHost !== host) {
    setHost(nextHost);
  }

  if (!host) {
    return null;
  }

  const chrome = {
    hideMenu,
    hideZoom,
    hideTools,
    hideHelp,
    hideLibrary,
    hideHistory,
  };
  const paper = withAlpha(background, backgroundOpacity);
  const limits = syncLimits ?? DEFAULT_SYNC_LIMITS;

  return (
    <>
      {/* one sheet for all the drawings: on a scene it would be a film over
          every drawing stacked below it, and only one would look drawn on */}
      {isOn &&
        createPortal(
          <div
            style={{
              position: "absolute",
              top: navbarInset + top,
              right,
              bottom,
              left,
              zIndex: zIndex - 1,
              background: paper,
              pointerEvents: "none",
            }}
          />,
          host
        )}
      {groups.map((group, index) => {
        const restored = saved.find((drawing) => drawing.id === group.id);
        return (
          <AnnotationScene
            key={group.id}
            id={group.id}
            host={host}
            libreMap={libreMap}
            onProbe={registerProbe}
            onSceneEdit={onSceneEdit}
            savedElements={restored?.elements}
            savedFiles={restored?.files}
            savedAnchor={restored?.anchor}
            editable={isOn && group.id === activeId && !group.locked}
            live={isOn}
            shown={isOn || !hideWhenOff}
            langCode={langCode}
            chrome={chrome}
            shape={shape}
            onToolChange={setShape}
            undoVersion={undoVersion}
            redoVersion={redoVersion}
            zoomVersion={zoomRequest?.id === group.id ? zoomRequest.version : 0}
            syncLimits={limits}
            anchorZoom={
              zoomOrigin === undefined || group.band === undefined
                ? undefined
                : anchorZoomOf(group.band, zoomOrigin, span, scales.min)
            }
            inset={{ top: navbarInset + top, right, bottom, left }}
            zIndex={zIndex + index}
          />
        );
      })}
    </>
  );
};
