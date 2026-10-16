import type { Radians } from "@carma-units";

import type { AnnotationScreenPosition } from "@carma-mapping/annotations/core";
import {
  formatLagReadouts,
  type PointQueryDebugLagMetrics,
} from "./point-query-debug-status";

const renderDebugVectorLine = ({
  element,
  start,
  end,
  headElement,
}: {
  element: HTMLDivElement;
  start: AnnotationScreenPosition;
  end: AnnotationScreenPosition;
  headElement?: HTMLDivElement;
}) => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthPx = Math.hypot(deltaX, deltaY);
  if (lengthPx < 0.5) {
    element.style.display = "none";
    if (headElement) {
      headElement.style.display = "none";
    }
    return;
  }

  const angleRad = Math.atan2(deltaY, deltaX) as Radians;
  element.style.display = "block";
  element.style.left = `${start.x}px`;
  element.style.top = `${start.y}px`;
  element.style.width = `${lengthPx}px`;
  element.style.transform = `translateY(-50%) rotate(${angleRad}rad)`;
  if (headElement) {
    headElement.style.display = "block";
    headElement.style.left = `${end.x}px`;
    headElement.style.top = `${end.y}px`;
    headElement.style.transform = `translate(-50%, -50%) rotate(${angleRad}rad)`;
  }
};

const createLagDebugElements = () => {
  const overlayElement = document.createElement("div");
  const lineElement = document.createElement("div");
  const headElement = document.createElement("div");
  const labelElement = document.createElement("div");

  Object.assign(overlayElement.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "2300",
    display: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(lineElement.style, {
    position: "fixed",
    height: "3px",
    background: "rgba(255, 92, 92, 0.95)",
    transformOrigin: "0 50%",
    pointerEvents: "none",
    display: "none",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(headElement.style, {
    position: "fixed",
    width: "0",
    height: "0",
    borderTop: "5px solid transparent",
    borderBottom: "5px solid transparent",
    borderLeft: "9px solid rgba(255, 92, 92, 0.95)",
    transformOrigin: "50% 50%",
    pointerEvents: "none",
    display: "none",
    filter: "drop-shadow(0 0 1px rgba(0,0,0,0.45))",
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(labelElement.style, {
    position: "fixed",
    padding: "2px 6px",
    borderRadius: "4px",
    background: "rgba(0,0,0,0.72)",
    color: "#ffffff",
    font: "12px/1.35 monospace",
    whiteSpace: "pre",
    pointerEvents: "none",
    display: "none",
  } satisfies Partial<CSSStyleDeclaration>);

  overlayElement.appendChild(lineElement);
  overlayElement.appendChild(headElement);
  overlayElement.appendChild(labelElement);
  document.body.appendChild(overlayElement);

  return { overlayElement, lineElement, headElement, labelElement };
};

/** The lag vector overlay; its elements are created on the first shown frame. */
export const createPointQueryLagDebugOverlay = () => {
  let elements: ReturnType<typeof createLagDebugElements> | null = null;

  const hide = () => {
    if (!elements) {
      return;
    }
    const { overlayElement, lineElement, headElement, labelElement } = elements;
    overlayElement.style.display = "none";
    lineElement.style.display = "none";
    headElement.style.display = "none";
    labelElement.style.display = "none";
  };

  const update = (
    metrics: PointQueryDebugLagMetrics,
    {
      rawClientPosition,
      renderedClientPosition,
      discClientPosition,
      sampleClientPosition,
    }: {
      rawClientPosition: AnnotationScreenPosition | null;
      renderedClientPosition: AnnotationScreenPosition | null;
      discClientPosition: AnnotationScreenPosition | null;
      sampleClientPosition: AnnotationScreenPosition | null;
    }
  ) => {
    if (!discClientPosition || (!rawClientPosition && !sampleClientPosition)) {
      hide();
      return;
    }

    let primaryStart: AnnotationScreenPosition | null = null;
    let primaryEnd: AnnotationScreenPosition | null = null;
    if (metrics.latestMeasuredLagSource === "offset" && sampleClientPosition) {
      primaryStart = discClientPosition;
      primaryEnd = sampleClientPosition;
    } else if (renderedClientPosition && rawClientPosition) {
      primaryStart = renderedClientPosition;
      primaryEnd = rawClientPosition;
    } else if (rawClientPosition) {
      primaryStart = discClientPosition;
      primaryEnd = rawClientPosition;
    }

    if (!primaryStart || !primaryEnd) {
      hide();
      return;
    }

    elements ??= createLagDebugElements();
    const { overlayElement, lineElement, headElement, labelElement } = elements;
    overlayElement.style.display = "block";
    renderDebugVectorLine({
      element: lineElement,
      start: primaryStart,
      end: primaryEnd,
      headElement,
    });

    const primaryLabelX = (primaryStart.x + primaryEnd.x) * 0.5;
    const primaryLabelY = (primaryStart.y + primaryEnd.y) * 0.5;
    labelElement.style.display = "block";
    labelElement.style.left = `${primaryLabelX + 10}px`;
    labelElement.style.top = `${primaryLabelY + 10}px`;
    const readouts = formatLagReadouts(metrics);
    labelElement.textContent = [
      readouts.lag,
      `live ${metrics.latestLiveLagPx.toFixed(1)}`,
      `off ${metrics.latestSampleOffsetPx.toFixed(1)}`,
      readouts.sync,
    ].join(" | ");
  };

  const destroy = () => {
    elements?.overlayElement.remove();
    elements = null;
  };

  return {
    update,
    hide,
    destroy,
  };
};
