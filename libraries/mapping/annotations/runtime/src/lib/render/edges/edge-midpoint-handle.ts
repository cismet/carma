import {
  buildOverlayHoverFilterCss,
  buildOverlayHoverTransitionCss,
  buildOverlayRingBoxShadowCss,
  labelOverlayAffordanceDefaults,
} from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma-units";

import { annotationEdgeDefaults } from "./edge-defaults";

export type EdgeMidpointHandle = {
  root: HTMLDivElement;
  tick: HTMLDivElement;
};

/** `hitAreaOnly`: the engine draws the tick; the overlay keeps the invisible hit area. */
export const createEdgeMidpointHandle = (
  overlayLayer: HTMLElement,
  { hitAreaOnly = false }: { hitAreaOnly?: boolean } = {}
): EdgeMidpointHandle => {
  const root = document.createElement("div");
  root.style.position = "absolute";
  root.style.display = "none";
  root.style.pointerEvents = "none";
  root.style.userSelect = "none";
  root.style.webkitUserSelect = "none";
  root.style.cursor = "default";

  const tick = document.createElement("div");
  tick.style.position = "absolute";
  tick.style.left = "50%";
  tick.style.top = "50%";
  tick.style.width = `${annotationEdgeDefaults.midpointMarker.tickLengthPx}px`;
  tick.style.height = `${annotationEdgeDefaults.midpointMarker.tickWidthPx}px`;
  tick.style.borderRadius = "999px";
  tick.style.background = annotationEdgeDefaults.midpointMarker.tickColor;
  tick.style.transform = "translate(-50%, -50%)";
  tick.style.pointerEvents = "none";
  tick.style.transition = buildOverlayHoverTransitionCss();
  if (hitAreaOnly) tick.style.visibility = "hidden";

  root.appendChild(tick);
  overlayLayer.appendChild(root);

  return {
    root,
    tick,
  };
};

const destroyEdgeMidpointHandle = (handle: EdgeMidpointHandle) => {
  handle.root.remove();
};

export const destroyEdgeMidpointHandles = (
  handles: Map<string, EdgeMidpointHandle>
) => {
  handles.forEach((handle) => {
    destroyEdgeMidpointHandle(handle);
  });
  handles.clear();
};

export const hideEdgeMidpointHandle = (handle: EdgeMidpointHandle) => {
  handle.root.style.display = "none";
  handle.root.onclick = null;
  handle.root.onmouseenter = null;
  handle.root.onmouseleave = null;
  handle.tick.style.transform = "translate(-50%, -50%)";
  handle.tick.style.boxShadow = "none";
  handle.tick.style.filter = "none";
};

const setEdgeMidpointHandleHovered = (
  handle: EdgeMidpointHandle,
  hovered: boolean
) => {
  handle.tick.style.transform = hovered
    ? `translate(-50%, -50%) scale(${labelOverlayAffordanceDefaults.hover.scale})`
    : "translate(-50%, -50%)";
  handle.tick.style.boxShadow = hovered
    ? buildOverlayRingBoxShadowCss()
    : "none";
  handle.tick.style.filter = hovered ? buildOverlayHoverFilterCss() : "none";
};

export const applyEdgeMidpointHandleLayout = ({
  handle,
  center,
  angleRad,
  zIndex,
  clickable,
  onClick,
  onHoverChange,
}: {
  handle: EdgeMidpointHandle;
  center: CssPixelPosition;
  angleRad: number;
  zIndex: number;
  clickable: boolean;
  onClick?: (() => void) | null;
  onHoverChange?: (hovered: boolean) => void;
}) => {
  handle.root.style.left = `${center.x}px`;
  handle.root.style.top = `${center.y}px`;
  handle.root.style.width = `${annotationEdgeDefaults.midpointMarker.hitTargetPx}px`;
  handle.root.style.height = `${annotationEdgeDefaults.midpointMarker.hitTargetPx}px`;
  handle.root.style.transform = `translate(-50%, -50%) rotate(${angleRad}rad)`;
  handle.root.style.transformOrigin = "50% 50%";
  handle.root.style.zIndex = `${Math.max(
    zIndex,
    annotationEdgeDefaults.midpointMarker.minOverlayZIndex
  )}`;
  handle.root.style.display = "block";
  handle.root.style.pointerEvents = clickable ? "auto" : "none";
  handle.root.style.cursor = clickable ? "pointer" : "default";
  handle.root.onclick = clickable && onClick ? onClick : null;
  handle.root.onmouseenter = clickable
    ? () => {
        setEdgeMidpointHandleHovered(handle, true);
        onHoverChange?.(true);
      }
    : null;
  handle.root.onmouseleave = clickable
    ? () => {
        setEdgeMidpointHandleHovered(handle, false);
        onHoverChange?.(false);
      }
    : null;
  setEdgeMidpointHandleHovered(handle, false);
};
