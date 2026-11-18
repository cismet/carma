import type { CSSProperties, ReactNode } from "react";

import type { CssPixelPosition } from "@carma-units";

import type { PointLabelAttach } from "../core/pointLabelAttach";
import type { PillbuttonBadgePosition } from "./PillbuttonLabelMarker";

export const POINT_LABEL_STYLE = {
  AUTO: "auto",
  CAPSULE: "capsule",
} as const;

export type PointLabelStyle =
  (typeof POINT_LABEL_STYLE)[keyof typeof POINT_LABEL_STYLE];

export interface PointLabelStyleProps {
  mixBlendMode?: CSSProperties["mixBlendMode"];
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string | number;
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
  /** CSS text-shadow of the label text, e.g. to keep white ink readable on a bright fill. */
  textShadow?: string;
  lineWidth?: number;
  lineColor?: string;
  markerSize?: number;
  markerStrokeWidth?: number;
  stemReferenceMarkerSize?: number;
  stemStartDistance?: number;
  nodeContent?: ReactNode;
  badgeContent?: ReactNode;
  markerBackgroundColor?: string;
  markerTextColor?: string;
  badgePosition?: PillbuttonBadgePosition;
  markerContent?: ReactNode;
  labelStyle?: PointLabelStyle;
  collapse?: boolean;
  labelDistance?: number;
}

export interface PointLabelProps extends PointLabelStyleProps {
  pointId?: string;
  content: ReactNode;
  selected?: boolean;
  isOccluded?: boolean;
  pitch?: number;
  labelAngleRad?: number;
  labelAttach?: PointLabelAttach;
  transitionDurationMs?: number;
  hideLabelAndStem?: boolean;
  /** Renders the stem element hidden; the pill keeps its place. */
  hideStem?: boolean;
  hideMarker?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onLongPress?: () => void;
  longPressDurationMs?: number;
  longPressOnlyOnMarker?: boolean;
  renderHiddenMarkerInteractionTarget?: boolean;
  onHoverChange?: (
    hovered: boolean,
    anchorPosition?: CssPixelPosition | null
  ) => void;
  markerOnlyPointerEvents?: boolean;
  forceMarkerInteractionTarget?: boolean;
  onMarkerDragStart?: (clientX: number, clientY: number) => void;
  onMarkerDragMove?: (clientX: number, clientY: number) => void;
  onMarkerDragEnd?: () => void;
}
