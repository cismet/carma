import { useEffect, useMemo, useRef, useState } from "react";

import type { AddonComponentProps } from "../../lib/registry";
import { stageHostOf } from "../comparing/stage/stage-host";
import { useToolbarInset } from "../comparing/stage/useToolbarInset";
import { reserveIdSequence, useAnnotationActions } from "./annotation-actions";
import { highestIdSequence, readDrawings } from "./annotation-storage";
import { AnnotationScene } from "./AnnotationScene";
import { useAnnotationStorage } from "./useAnnotationStorage";
import { useDrawingPicker } from "./useDrawingPicker";
import type { AnnotationInset, AnnotationSyncLimits } from "./types";

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
    hydrate,
  } = useAnnotationActions();

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
    hydrate(saved.map(({ id }) => ({ id, locked: true })));
  }, [hydrate, saved]);

  const onSceneEdit = useAnnotationStorage({
    storageKey,
    groups,
    restored: saved,
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
            dimmed={isOn && !isLocked && group.id !== activeId}
            live={isOn}
            shown={isOn || !hideWhenOff}
            langCode={langCode}
            background={paper}
            chrome={chrome}
            shape={shape}
            onToolChange={setShape}
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
