import type { CssPixelPosition, Radians } from "@carma-units";

import { DEFAULT_POINT_LABEL_FONT_SIZE } from "./components/PillbuttonLabelMarker";
import { readPointLabelTransform } from "./components/point-label-helpers";
import {
  estimatePillCapRadiusPx,
  resolveSegmentEndOutsideCircle,
  resolveSegmentEndOutsideHorizontalCapsule,
} from "./core/pillConnectorGeometry";
import type { PointLabelAttach } from "./core/pointLabelAttach";
import {
  resolveEffectiveBadgeContent,
  syncInlineTextOverlayContent,
} from "./point-label-overlay-content";
import {
  transientPointLabelOverlayDefaults,
  type PointLabelOverlayDomRefs,
  type PointLabelOverlayRenderState,
} from "./point-label-overlay-state";

const resolvePointLabelScreenPosition = (
  state: PointLabelOverlayRenderState
): CssPixelPosition | null =>
  state.getScreenPosition
    ? state.getScreenPosition()
    : state.screenPosition ?? null;

const getPillAnchorTransform = (
  attach: PointLabelAttach,
  pillCapRadiusPx: number
): string => {
  if (attach === "left") {
    return `translate(${-pillCapRadiusPx}px, -50%)`;
  }

  if (attach === "right") {
    return `translate(calc(-100% + ${pillCapRadiusPx}px), -50%)`;
  }

  return "translate(-50%, -50%)";
};

const parseFallbackFontSizePx = (fontSize = DEFAULT_POINT_LABEL_FONT_SIZE) => {
  const trimmedFontSize = fontSize.trim();
  const parsedFontSize = Number.parseFloat(trimmedFontSize);

  if (!Number.isFinite(parsedFontSize)) {
    return transientPointLabelOverlayDefaults.fallbackFontSizePx;
  }

  return trimmedFontSize.endsWith("rem")
    ? parsedFontSize * transientPointLabelOverlayDefaults.rootFontSizePx
    : parsedFontSize;
};

const resolveRenderedFontSizePx = ({
  labelRoot,
  fontSize,
}: {
  labelRoot: HTMLElement;
  fontSize?: string;
}) => {
  const computedFontSize =
    labelRoot.ownerDocument.defaultView?.getComputedStyle(labelRoot).fontSize ??
    "";
  const parsedComputedFontSize = Number.parseFloat(computedFontSize);

  return Number.isFinite(parsedComputedFontSize)
    ? parsedComputedFontSize
    : parseFallbackFontSizePx(fontSize);
};

export const readPointLabelOverlayDomRefs = (
  elementDiv: HTMLElement
): PointLabelOverlayDomRefs | null => {
  const stem = elementDiv.querySelector(
    '[data-point-label-stem="true"]'
  ) as HTMLDivElement | null;
  const stemLine = elementDiv.querySelector(
    '[data-point-label-stem-line="true"]'
  ) as HTMLDivElement | null;
  const labelRoot = elementDiv.querySelector(
    '[data-pillbutton-root="true"], [data-point-label-content-root="true"]'
  ) as HTMLElement | null;
  const pillBadge = elementDiv.querySelector(
    '[data-pillbutton-badge="true"]'
  ) as HTMLSpanElement | null;
  const pillContent = elementDiv.querySelector(
    '[data-pillbutton-content="true"]'
  ) as HTMLSpanElement | null;
  const pointLabelRoot = elementDiv.querySelector(
    '[data-point-label-root="true"]'
  ) as HTMLDivElement | null;

  if (!stem || !stemLine || !labelRoot || !pointLabelRoot) {
    return null;
  }

  return {
    stem,
    stemLine,
    labelRoot,
    pillBadge,
    pillContent,
    pointLabelRoot,
  };
};

/**
 * Positions the label and rotates the stem imperatively on the already
 * mounted DOM (per-frame path, no React render). Returns false when hidden.
 */
export const applyPointLabelOverlayState = ({
  elementDiv,
  domRefs,
  state,
}: {
  elementDiv: HTMLElement;
  domRefs: PointLabelOverlayDomRefs;
  state: PointLabelOverlayRenderState;
}) => {
  const screenPosition = resolvePointLabelScreenPosition(state);
  if (!screenPosition || state.visible === false) {
    return false;
  }

  elementDiv.style.left = `${screenPosition.x}px`;
  elementDiv.style.top = `${screenPosition.y}px`;
  elementDiv.style.transform = "none";
  elementDiv.style.zIndex = `${
    state.zIndex ?? transientPointLabelOverlayDefaults.zIndex
  }`;

  const labelOpacity = state.isOccluded ? "0.75" : "1";
  if (state.hideLabelAndStem) {
    domRefs.pointLabelRoot.style.opacity = labelOpacity;
    return true;
  }

  const { labelRoot, pillBadge, pillContent } = domRefs;
  const isPillRoot = labelRoot.hasAttribute("data-pillbutton-root");
  if (isPillRoot) {
    syncInlineTextOverlayContent(
      pillBadge,
      resolveEffectiveBadgeContent(state)
    );
    syncInlineTextOverlayContent(pillContent, state.content);
    if (pillBadge === null && pillContent === null) {
      syncInlineTextOverlayContent(labelRoot, state.content);
    }
  } else {
    syncInlineTextOverlayContent(labelRoot, state.content);
  }

  const angleRad = state.angleRad ?? (0 as Radians);
  const distance = state.distance ?? 0;
  const attach = state.attach ?? "center";
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const markerOuterRadius = state.hideMarker
    ? 0
    : (state.markerSize ?? transientPointLabelOverlayDefaults.markerSize) / 2 +
      (state.markerStrokeWidth ??
        transientPointLabelOverlayDefaults.markerStrokeWidth) /
        2;
  const isBadgeOnly = pillBadge !== null && pillContent === null;
  const compactBadgeWidthPx = isBadgeOnly ? pillBadge.offsetWidth : 0;
  const compactBadgeHeightPx = isBadgeOnly ? pillBadge.offsetHeight : 0;
  const compactBadgeCapRadiusPx =
    compactBadgeHeightPx > 0 ? compactBadgeHeightPx / 2 : null;
  const measuredPillCapRadiusPx =
    isPillRoot && labelRoot.offsetHeight > 0
      ? labelRoot.offsetHeight / 2
      : null;
  const pillCapRadiusPx =
    attach === "center"
      ? 0
      : compactBadgeCapRadiusPx ??
        measuredPillCapRadiusPx ??
        estimatePillCapRadiusPx(
          resolveRenderedFontSizePx({ labelRoot, fontSize: state.fontSize })
        );
  const stemStartDistance = state.stemStartDistance ?? markerOuterRadius;
  const stemStartPoint = {
    x: cos * stemStartDistance,
    y: sin * stemStartDistance,
  } as CssPixelPosition;
  const pillAnchorPoint = {
    x: cos * (distance + pillCapRadiusPx),
    y: sin * (distance + pillCapRadiusPx),
  } as CssPixelPosition;
  const visibleStemEndPoint =
    compactBadgeWidthPx > 0 && compactBadgeHeightPx > 0
      ? resolveSegmentEndOutsideHorizontalCapsule(
          stemStartPoint,
          pillAnchorPoint,
          attach,
          compactBadgeWidthPx,
          compactBadgeHeightPx
        )
      : pillCapRadiusPx > 0
      ? resolveSegmentEndOutsideCircle(
          stemStartPoint,
          pillAnchorPoint,
          pillCapRadiusPx
        )
      : { x: cos * distance, y: sin * distance };
  const lineDx = visibleStemEndPoint.x - stemStartPoint.x;
  const lineDy = visibleStemEndPoint.y - stemStartPoint.y;
  const lineLength = Math.hypot(lineDx, lineDy);

  domRefs.stem.style.display = lineLength > 0 ? "block" : "none";
  domRefs.stem.style.left = `${stemStartPoint.x}px`;
  domRefs.stem.style.top = `${stemStartPoint.y}px`;
  domRefs.stem.style.transformOrigin = "0 0";
  domRefs.stem.style.transform = `rotate(${Math.atan2(lineDy, lineDx)}rad)`;
  domRefs.stemLine.style.width = `${lineLength}px`;
  domRefs.stemLine.style.borderBottom = `1px ${
    state.isOccluded ? "dashed" : "solid"
  } ${state.lineColor ?? transientPointLabelOverlayDefaults.lineColor}`;

  labelRoot.style.left = `${pillAnchorPoint.x}px`;
  labelRoot.style.top = `${pillAnchorPoint.y}px`;
  labelRoot.style.transform = isPillRoot
    ? getPillAnchorTransform(attach, pillCapRadiusPx)
    : readPointLabelTransform(attach);
  domRefs.pointLabelRoot.style.opacity = labelOpacity;

  return true;
};
