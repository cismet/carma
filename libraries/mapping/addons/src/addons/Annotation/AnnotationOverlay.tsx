import { useMemo, useState } from "react";

import type { AddonComponentProps } from "../../lib/registry";
import { stageHostOf } from "../comparing/stage/stage-host";
import { useToolbarInset } from "../comparing/stage/useToolbarInset";
import { useAnnotationActions } from "./annotation-actions";
import { AnnotationScene } from "./AnnotationScene";
import { useDrawingPicker } from "./useDrawingPicker";
import type { AnnotationInset } from "./types";

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
    pickGroup,
  } = useAnnotationActions();
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
    // with a shape tool selected the click belongs to the shape; while the
    // active drawing is locked nothing is being drawn, so any click may pick up
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

  return (
    <>
      {groups.map((group, index) => (
        <AnnotationScene
          key={group.id}
          id={group.id}
          host={host}
          libreMap={libreMap}
          onProbe={registerProbe}
          editable={isOn && group.id === activeId && !group.locked}
          shown={isOn || !hideWhenOff}
          langCode={langCode}
          background={paper}
          chrome={chrome}
          shape={shape}
          undoVersion={undoVersion}
          redoVersion={redoVersion}
          inset={{ top: navbarInset + top, right, bottom, left }}
          // oldest first, so a newer drawing stacks over the older ones
          zIndex={zIndex + index}
        />
      ))}
    </>
  );
};
