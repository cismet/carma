import type { WheelEvent as ReactWheelEvent } from "react";

import { getEquilateralTrianglePathD } from "@carma-commons/math";
import { AXIS_NUMERIC_EPSILON, toSvgPathD } from "@carma-mapping/gizmo/core";

import type { ConeArrowSilhouette } from "./engine-point-move-gizmo-math";
import {
  AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX,
  CONE_ARROW_BOX_PADDING_PX,
} from "./engine-point-move-gizmo-constants";

export const getPhysicalHairlinePx = (): number => {
  if (typeof window === "undefined") return 1;
  const dpr = window.devicePixelRatio;
  if (!Number.isFinite(dpr) || dpr <= AXIS_NUMERIC_EPSILON) return 1;
  return 1 / dpr;
};

/** Teardown can race with engine or widget disposal; failures are ignored. */
export const safeDestroy = (
  destroyable: { destroy: () => void } | null | undefined
) => {
  if (!destroyable) return;
  try {
    destroyable.destroy();
  } catch {
    // already destroyed
  }
};

export const safeCall = (callback: (() => void) | null | undefined) => {
  if (!callback) return;
  try {
    callback();
  } catch {
    // listener already removed
  }
};

type GlobalCursorHolder = { restoreGlobalCursor: (() => void) | null };

/** Shows the cursor on the whole page; the first call remembers what to restore. */
export const setGlobalDragCursor = (
  holder: GlobalCursorHolder,
  cursor: string
) => {
  if (typeof document === "undefined") return;
  const htmlElement = document.documentElement;
  const bodyElement = document.body;
  if (!htmlElement || !bodyElement) return;

  if (!holder.restoreGlobalCursor) {
    const previousHtmlCursor = htmlElement.style.cursor;
    const previousBodyCursor = bodyElement.style.cursor;
    holder.restoreGlobalCursor = () => {
      htmlElement.style.cursor = previousHtmlCursor;
      bodyElement.style.cursor = previousBodyCursor;
      holder.restoreGlobalCursor = null;
    };
  }

  htmlElement.style.cursor = cursor;
  bodyElement.style.cursor = cursor;
};

export const restoreGlobalDragCursor = (holder: GlobalCursorHolder) => {
  holder.restoreGlobalCursor?.();
};

/** Re-dispatches a wheel over the gizmo to the canvas so zoom keeps working. */
export const forwardWheelToCanvas = (
  canvas: HTMLCanvasElement,
  event: ReactWheelEvent
) => {
  canvas.dispatchEvent(
    new WheelEvent("wheel", {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      deltaMode: event.deltaMode,
      clientX: event.clientX,
      clientY: event.clientY,
      bubbles: false,
      cancelable: true,
    })
  );
};

const getClosedPolygonPathD = (points: ConeArrowSilhouette["hull"]) =>
  toSvgPathD(points, { close: true, digits: 2 });

export const updateTrianglePathAppearance = (
  pathElement: SVGPathElement | null,
  edgeLengthPx: number
) => {
  if (!pathElement) return;
  pathElement.setAttribute("d", getEquilateralTrianglePathD(edgeLengthPx));
  pathElement.setAttribute(
    "stroke-width",
    `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`
  );
  pathElement.setAttribute("stroke-linejoin", "round");
  pathElement.setAttribute("stroke-linecap", "round");
};

/** Puts the tip dot of an arrow svg on a point of its view box. */
export const placeArrowTipDot = (
  arrowElement: Element,
  tip: { x: number; y: number }
) => {
  const dot = arrowElement.querySelector(
    "[data-point-move-axis-arrow-tip]"
  ) as SVGCircleElement | null;
  if (!dot) return;
  dot.setAttribute("cx", `${tip.x}`);
  dot.setAttribute("cy", `${tip.y}`);
};

/**
 * Draws a move arrow as its projected cone: the svg box spans the hull in
 * anchor-relative pixels and the base rim shows while the camera looks at the
 * base. Without a silhouette the flat triangle stays as laid out.
 */
export const applyConeArrowSilhouette = (
  arrowElement: HTMLElement,
  silhouette: ConeArrowSilhouette | null
) => {
  const rimPath = arrowElement.querySelector(
    "[data-point-move-axis-arrow-rim]"
  ) as SVGPathElement | null;
  if (!silhouette || silhouette.hull.length < 3) {
    if (rimPath) rimPath.style.display = "none";
    return;
  }
  const outlinePath = arrowElement.querySelector(
    "[data-point-move-axis-arrow-outline]"
  ) as SVGPathElement | null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of silhouette.hull) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  minX -= CONE_ARROW_BOX_PADDING_PX;
  minY -= CONE_ARROW_BOX_PADDING_PX;
  const width = maxX + CONE_ARROW_BOX_PADDING_PX - minX;
  const height = maxY + CONE_ARROW_BOX_PADDING_PX - minY;
  arrowElement.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
  arrowElement.style.width = `${width}px`;
  arrowElement.style.height = `${height}px`;
  arrowElement.style.left = `calc(50% + ${minX}px)`;
  arrowElement.style.top = `calc(50% + ${minY}px)`;
  arrowElement.style.transformOrigin = "0 0";
  arrowElement.style.transform = "none";
  outlinePath?.setAttribute("d", getClosedPolygonPathD(silhouette.hull));
  placeArrowTipDot(arrowElement, silhouette.apex);
  if (rimPath) {
    if (silhouette.baseRim) {
      rimPath.setAttribute("d", getClosedPolygonPathD(silhouette.baseRim));
      rimPath.style.display = "block";
    } else {
      rimPath.style.display = "none";
    }
  }
};
