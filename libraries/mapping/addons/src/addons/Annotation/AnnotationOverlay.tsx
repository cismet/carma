import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types/types";

import {
  DEFAULT_MAX_PITCH,
  setCameraRestrictionOverride,
} from "@carma-mapping/engines/maplibre";

import type { AddonComponentProps } from "../../lib/registry";
import { stageHostOf } from "../comparing/stage/stage-host";
import { useToolbarInset } from "../comparing/stage/useToolbarInset";
import { reserveIdSequence, useAnnotationActions } from "./annotation-actions";
import { highestIdSequence, readDrawings } from "./annotation-storage";
import { coverageAround } from "./annotation-zoom-coverage";
import type { AnnotationPen } from "./annotation-pen";
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
const DEFAULT_ZOOM_RANGE = { min: 50, max: 200 };

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
 * There is one drawing. It takes its anchor from the camera it is opened at
 * and keeps it from its first stroke on; nothing here opens a second one, and
 * a zoom no longer hands the pencil anywhere. What a zoom does instead is
 * leave the drawing alone and rewrite its decoration, see `useDecorationScale`.
 * `annotationControl` flips the `annotationMode` channel; off means view mode
 * and `pointer-events: none`.
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
    pickGroup,
    setShape,
    setCoverage,
    hydrate,
  } = useAnnotationActions();

  const scales = useMemo(
    () => ({
      min: (zoomRange?.min ?? DEFAULT_ZOOM_RANGE.min) / 100,
      max: (zoomRange?.max ?? DEFAULT_ZOOM_RANGE.max) / 100,
    }),
    [zoomRange?.max, zoomRange?.min]
  );

  const [saved] = useState(() => readDrawings(storageKey));
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
    hydrate(saved.map(({ id, coverage }) => ({ id, coverage, locked: true })));
  }, [hydrate, saved]);

  const storeSceneEdit = useAnnotationStorage({
    storageKey,
    groups,
    restored: saved,
  });

  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const onSceneEdit = useCallback(
    (
      id: string,
      elements: readonly ExcalidrawElement[],
      files: BinaryFiles,
      anchor: AnnotationAnchor | null
    ) => {
      storeSceneEdit(id, elements, files, anchor);
      // the stroke that starts a drawing is what fixes the zooms it reads
      // 100 % at, and what turns it into a drawing the toolbar lists
      const groups = groupsRef.current;
      const group = groups.find((entry) => entry.id === id);
      if (!group || group.coverage || !anchor) {
        return;
      }
      if (elements.some((element) => !element.isDeleted)) {
        setCoverage(id, coverageAround(anchor.zoom, scales, groups));
      }
    },
    [scales, setCoverage, storeSceneEdit]
  );

  /**
   * The one pen every drawing shares. A ref, not state: it changes with every
   * stroke and nothing outside the scenes renders it, so a re-render per change
   * would cost the excalidraw instances for nothing.
   */
  const penRef = useRef<AnnotationPen | null>(null);
  const onPenChange = useCallback((pen: AnnotationPen) => {
    penRef.current = pen;
  }, []);
  const getPen = useCallback(() => penRef.current, []);

  /**
   * The camera may turn and tilt while the pencil is out, whatever the route
   * otherwise allows. The lock the addon used to put on is gone: the drawing
   * follows bearing and pitch by itself now — flat and north-up it is the
   * upright scene, and the ground plane takes over the moment the camera
   * leaves that, see `annotation-plane-active`. Locking here would also be a
   * trap, since a camera held flat could never reach the tilt that turns the
   * plane on. Ending the mode hands the camera back.
   *
   * It goes through the map's camera-restriction override, the one channel the
   * engine applies and publishes, so the compass and the pitch control follow
   * without knowing this addon exists. A base the app marked forced, print
   * above all, still wins, and a `cameraRestriction` addon on the same route
   * writes the same slot: the later write stands.
   */
  useEffect(() => {
    if (!libreMap || !isOn) {
      return;
    }
    setCameraRestrictionOverride(libreMap, {
      restricted: false,
      maxPitch: DEFAULT_MAX_PITCH,
    });
    return () => {
      setCameraRestrictionOverride(libreMap, null);
    };
  }, [isOn, libreMap]);

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
            onPenChange={onPenChange}
            getPen={getPen}
            undoVersion={undoVersion}
            redoVersion={redoVersion}
            zoomVersion={zoomRequest?.id === group.id ? zoomRequest.version : 0}
            syncLimits={limits}
            inset={{ top: navbarInset + top, right, bottom, left }}
            zIndex={zIndex + index}
          />
        );
      })}
    </>
  );
};
