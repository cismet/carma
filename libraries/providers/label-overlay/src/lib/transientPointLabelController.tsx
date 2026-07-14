import type { CSSProperties, ReactNode } from "react";

import type { CssPixelPosition, Radians } from "@carma-units";

import {
  PointLabel,
  DEFAULT_POINT_LABEL_FONT_SIZE,
  type PointLabelAttach,
  type PointLabelStyle,
} from "./components/PointLabel";
import { POINT_LABEL_COMPONENT_DEFAULTS } from "./components/pointLabelDefaults";
import {
  estimatePillCapRadiusPx,
  resolveSegmentEndOutsideCircle,
  resolveSegmentEndOutsideHorizontalCapsule,
} from "./core/pillConnectorGeometry";
import { getOverlayReferenceSignature } from "./overlayReferenceSignature";
import type { LabelOverlayContextType } from "./types";

const transientPointLabelControllerDefaults = Object.freeze({
  markerSize: POINT_LABEL_COMPONENT_DEFAULTS.markerSize,
  markerStrokeWidth: POINT_LABEL_COMPONENT_DEFAULTS.markerStrokeWidth,
  lineColor: POINT_LABEL_COMPONENT_DEFAULTS.lineColor,
  zIndex: 0,
  fallbackFontSizePx: 12,
  rootFontSizePx: 16,
});

export type PointLabelOverlayDomRefs = {
  stem: HTMLDivElement;
  stemLine: HTMLDivElement;
  labelRoot: HTMLElement;
  pillBadge: HTMLSpanElement | null;
  pillContent: HTMLSpanElement | null;
  pointLabelRoot: HTMLDivElement;
};

export type PointLabelOverlayRenderState = {
  pointId?: string;
  content: ReactNode;
  badgeContent?: ReactNode;
  mixBlendMode?: CSSProperties["mixBlendMode"];
  selected?: boolean;
  markerCursor?: CSSProperties["cursor"];
  labelCursor?: CSSProperties["cursor"];
  textColor?: string;
  textBackgroundColor?: string;
  selectedBackgroundColor?: string;
  selectedTextColor?: string;
  selectedGlowColor?: string;
  selectedGlowRadiusPx?: number;
  preserveFillOnSelection?: boolean;
  hoverBackgroundColor?: string;
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  hideMarker?: boolean;
  hideLabelAndStem?: boolean;
  markerSize?: number;
  markerStrokeWidth?: number;
  stemStartDistance?: number;
  markerBackgroundColor?: string;
  markerTextColor?: string;
  lineColor?: string;
  labelStyle?: PointLabelStyle;
  collapse?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onHoverChange?: (
    hovered: boolean,
    anchorPosition?: CssPixelPosition | null
  ) => void;
  onLongPress?: () => void;
  markerOnlyPointerEvents?: boolean;
  longPressDurationMs?: number;
  longPressOnlyOnMarker?: boolean;
  renderHiddenMarkerInteractionTarget?: boolean;
  screenPosition?: CssPixelPosition | null;
  getScreenPosition?: () => CssPixelPosition | null;
  angleRad?: Radians;
  distance?: number;
  attach?: PointLabelAttach;
  isOccluded?: boolean;
  visible?: boolean;
  zIndex?: number;
};

export type TransientPointLabelController = {
  setState: (state: PointLabelOverlayRenderState | null) => void;
  destroy: () => void;
};

const textOnlyPointLabelOverlayThemeDefaults = Object.freeze({
  brightOnDark: Object.freeze({
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    textColor: "rgba(248, 250, 252, 0.98)",
  }),
  darkOnBright: Object.freeze({
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    textColor: "rgba(15, 23, 42, 0.92)",
  }),
});

export type TextOnlyPointLabelOverlayTheme =
  | "dark-on-bright"
  | "bright-on-dark";

export type TextOnlyPointLabelOverlayStateOptions = {
  text: ReactNode;
  getScreenPosition: () => CssPixelPosition | null;
  theme?: TextOnlyPointLabelOverlayTheme;
  lineColor?: string;
  textBackgroundColor?: string;
  textColor?: string;
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  mixBlendMode?: CSSProperties["mixBlendMode"];
  attach?: PointLabelAttach;
  distance?: number;
  hideMarker?: boolean;
};

export const buildTextOnlyPointLabelOverlayState = ({
  text,
  getScreenPosition,
  theme = "bright-on-dark",
  lineColor,
  textBackgroundColor,
  textColor,
  fontSize,
  fontFamily,
  fontWeight,
  mixBlendMode,
  attach = "center",
  distance = 0,
  hideMarker = true,
}: TextOnlyPointLabelOverlayStateOptions): PointLabelOverlayRenderState => {
  const resolvedThemeDefaults =
    theme === "dark-on-bright"
      ? textOnlyPointLabelOverlayThemeDefaults.darkOnBright
      : textOnlyPointLabelOverlayThemeDefaults.brightOnDark;

  return {
    content: text,
    hideMarker,
    lineColor,
    textBackgroundColor:
      textBackgroundColor ?? resolvedThemeDefaults.backgroundColor,
    textColor: textColor ?? resolvedThemeDefaults.textColor,
    fontSize,
    fontFamily,
    fontWeight,
    mixBlendMode,
    attach,
    distance,
    getScreenPosition,
  };
};

const isInlineTextOverlayContent = (value: unknown): value is string | number =>
  typeof value === "string" || typeof value === "number";

const getInlineTextOverlayContentSignature = (value: unknown) =>
  isInlineTextOverlayContent(value)
    ? `inline-text:${String(value).trim().length > 0 ? "1" : "0"}`
    : getOverlayReferenceSignature(value);

const syncInlineTextOverlayContent = (
  element: HTMLElement | null,
  value: unknown
) => {
  if (!element || !isInlineTextOverlayContent(value)) {
    return;
  }

  const nextTextContent = String(value);
  if (element.textContent !== nextTextContent) {
    element.textContent = nextTextContent;
  }
};

const resolvePointLabelScreenPosition = (
  state: PointLabelOverlayRenderState
): CssPixelPosition | null =>
  state.getScreenPosition
    ? state.getScreenPosition()
    : state.screenPosition ?? null;

const resolveEffectiveBadgeContent = (
  state: Pick<
    PointLabelOverlayRenderState,
    "badgeContent" | "content" | "hideMarker"
  >
) =>
  state.hideMarker ? state.badgeContent : state.badgeContent ?? state.content;

const getAttachTransform = (attach: PointLabelAttach): string => {
  if (attach === "left") {
    return "translate(0%, -50%)";
  }

  if (attach === "right") {
    return "translate(-100%, -50%)";
  }

  return "translate(-50%, -50%)";
};

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
    return transientPointLabelControllerDefaults.fallbackFontSizePx;
  }

  return trimmedFontSize.endsWith("rem")
    ? parsedFontSize * transientPointLabelControllerDefaults.rootFontSizePx
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

export const getPointLabelOverlayContentSignature = (
  state: PointLabelOverlayRenderState
) => {
  const effectiveBadgeContent = resolveEffectiveBadgeContent(state);

  return [
    state.pointId ?? "",
    `${state.selected ?? false}`,
    `${state.hideMarker ?? false}`,
    `${state.hideLabelAndStem ?? false}`,
    `${state.markerSize ?? ""}`,
    `${state.markerStrokeWidth ?? ""}`,
    `${state.stemStartDistance ?? ""}`,
    `${state.textBackgroundColor ?? ""}`,
    `${state.textColor ?? ""}`,
    `${state.markerBackgroundColor ?? ""}`,
    `${state.markerTextColor ?? ""}`,
    `${state.lineColor ?? ""}`,
    `${state.labelStyle ?? ""}`,
    `${state.collapse ?? false}`,
    `${state.selectedBackgroundColor ?? ""}`,
    `${state.selectedTextColor ?? ""}`,
    `${state.selectedGlowColor ?? ""}`,
    `${state.selectedGlowRadiusPx ?? ""}`,
    `${state.preserveFillOnSelection ?? false}`,
    `${state.hoverBackgroundColor ?? ""}`,
    `${state.fontSize ?? ""}`,
    `${state.fontFamily ?? ""}`,
    `${state.fontWeight ?? ""}`,
    `${state.mixBlendMode ?? ""}`,
    `${state.longPressDurationMs ?? ""}`,
    `${state.markerOnlyPointerEvents ?? false}`,
    `${state.longPressOnlyOnMarker ?? false}`,
    `${state.renderHiddenMarkerInteractionTarget ?? false}`,
    getInlineTextOverlayContentSignature(state.content),
    getInlineTextOverlayContentSignature(effectiveBadgeContent),
    getOverlayReferenceSignature(state.onClick),
    getOverlayReferenceSignature(state.onDoubleClick),
    getOverlayReferenceSignature(state.onHoverChange),
    getOverlayReferenceSignature(state.onLongPress),
  ].join(":");
};

export const renderPointLabelOverlayContent = (
  state: PointLabelOverlayRenderState
) => (
  <PointLabel
    pointId={state.pointId}
    content={state.content}
    selected={state.selected}
    hideLabelAndStem={state.hideLabelAndStem}
    hideMarker={state.hideMarker ?? false}
    markerSize={state.markerSize}
    markerStrokeWidth={state.markerStrokeWidth}
    stemStartDistance={state.stemStartDistance}
    badgeContent={resolveEffectiveBadgeContent(state)}
    markerBackgroundColor={state.markerBackgroundColor}
    markerTextColor={state.markerTextColor}
    mixBlendMode={state.mixBlendMode}
    lineColor={state.lineColor}
    labelStyle={state.labelStyle}
    collapse={state.collapse}
    textBackgroundColor={state.textBackgroundColor}
    textColor={state.textColor}
    selectedBackgroundColor={state.selectedBackgroundColor}
    selectedTextColor={state.selectedTextColor}
    selectedGlowColor={state.selectedGlowColor}
    selectedGlowRadiusPx={state.selectedGlowRadiusPx}
    preserveFillOnSelection={state.preserveFillOnSelection}
    hoverBackgroundColor={state.hoverBackgroundColor}
    fontSize={state.fontSize}
    fontFamily={state.fontFamily}
    fontWeight={state.fontWeight}
    markerCursor={state.markerCursor}
    labelCursor={state.labelCursor}
    onClick={state.onClick}
    onDoubleClick={state.onDoubleClick}
    onHoverChange={state.onHoverChange}
    onLongPress={state.onLongPress}
    markerOnlyPointerEvents={state.markerOnlyPointerEvents}
    longPressDurationMs={state.longPressDurationMs}
    longPressOnlyOnMarker={state.longPressOnlyOnMarker}
    renderHiddenMarkerInteractionTarget={
      state.renderHiddenMarkerInteractionTarget
    }
    isOccluded={state.isOccluded}
    labelAngleRad={state.angleRad}
    labelDistance={state.distance}
    labelAttach={state.attach}
  />
);

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
    state.zIndex ?? transientPointLabelControllerDefaults.zIndex
  }`;

  if (state.hideLabelAndStem) {
    domRefs.pointLabelRoot.style.opacity = state.isOccluded ? "0.75" : "1";
    return true;
  }

  const effectiveBadgeContent = resolveEffectiveBadgeContent(state);
  if (domRefs.labelRoot.hasAttribute("data-pillbutton-root")) {
    syncInlineTextOverlayContent(domRefs.pillBadge, effectiveBadgeContent);
    syncInlineTextOverlayContent(domRefs.pillContent, state.content);
    if (domRefs.pillBadge === null && domRefs.pillContent === null) {
      syncInlineTextOverlayContent(domRefs.labelRoot, state.content);
    }
  } else {
    syncInlineTextOverlayContent(domRefs.labelRoot, state.content);
  }

  const angleRad = state.angleRad ?? (0 as Radians);
  const distance = state.distance ?? 0;
  const attach = state.attach ?? "center";
  const dx = Math.cos(angleRad) * distance;
  const dy = Math.sin(angleRad) * distance;
  const markerOuterRadius = state.hideMarker
    ? 0
    : (state.markerSize ?? transientPointLabelControllerDefaults.markerSize) /
        2 +
      (state.markerStrokeWidth ??
        transientPointLabelControllerDefaults.markerStrokeWidth) /
        2;
  const compactBadgeWidthPx =
    domRefs.pillBadge !== null && domRefs.pillContent === null
      ? domRefs.pillBadge.offsetWidth
      : 0;
  const compactBadgeHeightPx =
    domRefs.pillBadge !== null && domRefs.pillContent === null
      ? domRefs.pillBadge.offsetHeight
      : 0;
  const compactBadgeCapRadiusPx =
    compactBadgeHeightPx > 0 ? compactBadgeHeightPx / 2 : null;
  const measuredPillCapRadiusPx =
    domRefs.labelRoot.hasAttribute("data-pillbutton-root") &&
    domRefs.labelRoot.offsetHeight > 0
      ? domRefs.labelRoot.offsetHeight / 2
      : null;
  const pillCapRadiusPx =
    attach === "center"
      ? 0
      : compactBadgeCapRadiusPx ??
        measuredPillCapRadiusPx ??
        estimatePillCapRadiusPx(
          resolveRenderedFontSizePx({
            labelRoot: domRefs.labelRoot,
            fontSize: state.fontSize,
          })
        );
  const stemStartPoint = {
    x: Math.cos(angleRad) * (state.stemStartDistance ?? markerOuterRadius),
    y: Math.sin(angleRad) * (state.stemStartDistance ?? markerOuterRadius),
  } as CssPixelPosition;
  const pillAnchorPoint = {
    x: Math.cos(angleRad) * (distance + pillCapRadiusPx),
    y: Math.sin(angleRad) * (distance + pillCapRadiusPx),
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
      : {
          x: dx,
          y: dy,
        };
  const lineDx = visibleStemEndPoint.x - stemStartPoint.x;
  const lineDy = visibleStemEndPoint.y - stemStartPoint.y;
  const lineLength = Math.max(0, Math.hypot(lineDx, lineDy));
  const lineAngleRad = Math.atan2(lineDy, lineDx);

  domRefs.stem.style.display = lineLength > 0 ? "block" : "none";
  domRefs.stem.style.left = `${stemStartPoint.x}px`;
  domRefs.stem.style.top = `${stemStartPoint.y}px`;
  domRefs.stem.style.transformOrigin = "0 0";
  domRefs.stem.style.transform = `rotate(${lineAngleRad}rad)`;
  domRefs.stemLine.style.width = `${lineLength}px`;
  domRefs.stemLine.style.borderBottom = `1px ${
    state.isOccluded ? "dashed" : "solid"
  } ${state.lineColor ?? transientPointLabelControllerDefaults.lineColor}`;

  domRefs.labelRoot.style.left = `${pillAnchorPoint.x}px`;
  domRefs.labelRoot.style.top = `${pillAnchorPoint.y}px`;
  domRefs.labelRoot.style.transform = domRefs.labelRoot.hasAttribute(
    "data-pillbutton-root"
  )
    ? getPillAnchorTransform(attach, pillCapRadiusPx)
    : getAttachTransform(attach);
  domRefs.pointLabelRoot.style.opacity = state.isOccluded ? "0.75" : "1";

  return true;
};

export const createTransientPointLabelController = ({
  labelOverlay,
  overlayId,
  requestRender,
}: {
  labelOverlay: LabelOverlayContextType;
  overlayId: string;
  requestRender?: () => void;
}): TransientPointLabelController => {
  let mounted = false;
  let destroyed = false;
  let currentState: PointLabelOverlayRenderState | null = null;
  let currentContentSignature: string | null = null;
  let cachedDomRefs: PointLabelOverlayDomRefs | null = null;

  const updatePosition = (elementDiv: HTMLElement) => {
    if (!currentState) {
      return false;
    }

    const domRefs =
      cachedDomRefs &&
      cachedDomRefs.stem.isConnected &&
      cachedDomRefs.stemLine.isConnected &&
      cachedDomRefs.labelRoot.isConnected &&
      cachedDomRefs.pointLabelRoot.isConnected
        ? cachedDomRefs
        : readPointLabelOverlayDomRefs(elementDiv);

    if (!domRefs) {
      return false;
    }

    cachedDomRefs = domRefs;
    return applyPointLabelOverlayState({
      elementDiv,
      domRefs,
      state: currentState,
    });
  };

  const syncOverlayElement = () => {
    if (destroyed) {
      return;
    }

    if (!currentState) {
      if (mounted) {
        labelOverlay.updatePositions();
        requestRender?.();
      }
      return;
    }

    const nextContentSignature =
      getPointLabelOverlayContentSignature(currentState);

    if (nextContentSignature !== currentContentSignature) {
      currentContentSignature = nextContentSignature;
      cachedDomRefs = null;
    }

    labelOverlay.setLabelOverlayElement({
      id: overlayId,
      zIndex:
        currentState.zIndex ?? transientPointLabelControllerDefaults.zIndex,
      contentKey: nextContentSignature,
      content: renderPointLabelOverlayContent(currentState),
      updatePosition,
    });
    mounted = true;
    labelOverlay.updatePositions();
    requestRender?.();
  };

  return {
    setState: (state) => {
      currentState = state;
      syncOverlayElement();
    },
    destroy: () => {
      if (destroyed) {
        return;
      }

      destroyed = true;
      currentState = null;
      currentContentSignature = null;
      cachedDomRefs = null;

      if (!mounted) {
        return;
      }

      mounted = false;
      labelOverlay.removeLabelOverlayElement(overlayId);
    },
  };
};
