import type { CSSProperties, ReactNode } from "react";

import type { CssPixelPosition, Radians } from "@carma-units";

import type { PointLabelAttach } from "./core/pointLabelAttach";
import type { PointLabelStyle } from "./components/point-label-types";
import { POINT_LABEL_COMPONENT_DEFAULTS } from "./components/pointLabelDefaults";

export const transientPointLabelOverlayDefaults = Object.freeze({
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
  textShadow?: string;
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  hideMarker?: boolean;
  hideLabelAndStem?: boolean;
  /** Keeps the stem element mounted but hidden, e.g. while the engine draws the stem in the scene. */
  hideStem?: boolean;
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
  const themeDefaults =
    theme === "dark-on-bright"
      ? textOnlyPointLabelOverlayThemeDefaults.darkOnBright
      : textOnlyPointLabelOverlayThemeDefaults.brightOnDark;

  return {
    content: text,
    hideMarker,
    lineColor,
    textBackgroundColor: textBackgroundColor ?? themeDefaults.backgroundColor,
    textColor: textColor ?? themeDefaults.textColor,
    fontSize,
    fontFamily,
    fontWeight,
    mixBlendMode,
    attach,
    distance,
    getScreenPosition,
  };
};
