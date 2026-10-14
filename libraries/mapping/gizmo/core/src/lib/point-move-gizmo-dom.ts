import { getEquilateralTrianglePathD } from "@carma-commons/math";

import { AXIS_NUMERIC_EPSILON } from "./constants";
import { AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX } from "./point-move-gizmo-constants";

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

export type GlobalDragCursorHolder = {
  restoreGlobalCursor: (() => void) | null;
};

/** Shows the cursor on the whole page; the first call remembers what to restore. */
export const setGlobalDragCursor = (
  holder: GlobalDragCursorHolder,
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

export const restoreGlobalDragCursor = (holder: GlobalDragCursorHolder) => {
  holder.restoreGlobalCursor?.();
};

type ForwardedWheel = Pick<
  WheelEvent,
  "deltaX" | "deltaY" | "deltaZ" | "deltaMode" | "clientX" | "clientY"
>;

/**
 * Re-dispatches a wheel over the gizmo overlay (which captures pointer events
 * for dragging) to the canvas so zoom keeps working.
 */
export const forwardWheelToCanvas = (
  canvas: HTMLCanvasElement,
  event: ForwardedWheel,
  options: Pick<
    WheelEventInit,
    "bubbles" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
  > = {}
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
      ...options,
    })
  );
};

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
