import { toSvgPathD } from "@carma-mapping/gizmo/core";

import type { ConeArrowSilhouette } from "./engine-point-move-gizmo-math";
import { CONE_ARROW_BOX_PADDING_PX } from "./engine-point-move-gizmo-constants";

const getClosedPolygonPathD = (points: ConeArrowSilhouette["hull"]) =>
  toSvgPathD(points, { close: true, digits: 2 });

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
