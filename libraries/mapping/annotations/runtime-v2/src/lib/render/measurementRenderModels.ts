import type { ReactNode } from "react";
import type {
  PointLabelAnchorKind,
  PointLabelAttach,
  PointLabelOcclusionMode,
  PointLabelStyle,
} from "@carma-providers/label-overlay";

import type { RuntimeCoordinate } from "../store";

export const RUNTIME_POINT_LABEL_COORDINATE_SELECTION = {
  RIGHTMOST_SCREEN_SPACE: "rightmost-screen-space",
  LEFTMOST_SCREEN_SPACE: "leftmost-screen-space",
} as const;
export type RuntimePointLabelCoordinateSelection =
  (typeof RUNTIME_POINT_LABEL_COORDINATE_SELECTION)[keyof typeof RUNTIME_POINT_LABEL_COORDINATE_SELECTION];

export const RUNTIME_DISTANCE_TRIANGLE_ANCHOR_COORDINATE_ROLE = {
  START_COORDINATE: "start-coordinate",
  END_COORDINATE: "end-coordinate",
} as const;
export type RuntimeDistanceTriangleAnchorCoordinateRole =
  (typeof RUNTIME_DISTANCE_TRIANGLE_ANCHOR_COORDINATE_ROLE)[keyof typeof RUNTIME_DISTANCE_TRIANGLE_ANCHOR_COORDINATE_ROLE];

export type RuntimePointLabelCoordinateCandidate = {
  coordinate: RuntimeCoordinate;
  nodeId?: string;
};

export type RuntimeDistanceTriangleOverlayRenderModel = {
  measurementId?: string;
  anchorCoordinateRole?: RuntimeDistanceTriangleAnchorCoordinateRole;
};

export type RuntimePointMarkerRenderModel = {
  id: string;
  measurementId?: string;
  nodeId?: string;
  coordinate: RuntimeCoordinate;
  pixelSize: number;
  fill: string;
  outline: string;
  outlineWidth: number;
  onClick?: () => void;
};

export type RuntimeEdgeRenderModel = {
  id: string;
  measurementId?: string;
  nodeIds?: readonly string[];
  coordinates: readonly RuntimeCoordinate[];
  stroke: string;
  strokeWidth: number;
  dashed?: boolean;
  distanceTriangleOverlay?: RuntimeDistanceTriangleOverlayRenderModel;
};

export type RuntimePolygonFillRenderModel = {
  id: string;
  coordinates: readonly RuntimeCoordinate[];
  fill: string;
  placement?: RuntimePolygonFillPlacement;
  selected?: boolean;
};

export const RUNTIME_POLYGON_FILL_PLACEMENT = {
  GROUND: "ground",
  COPLANAR: "coplanar",
} as const;
export type RuntimePolygonFillPlacement =
  (typeof RUNTIME_POLYGON_FILL_PLACEMENT)[keyof typeof RUNTIME_POLYGON_FILL_PLACEMENT];

export const RUNTIME_OVERLAY_DISTANCE_Z_INDEX = {
  MIN: 1,
  MAX: 1400,
  LOG_SCALE: 64,
} as const;

export const resolveRuntimeOverlayDistanceZIndex = (
  distanceMeters: number
): number => {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    return RUNTIME_OVERLAY_DISTANCE_Z_INDEX.MIN;
  }

  const compressedDepth =
    Math.log2(Math.max(1, distanceMeters) + 1) *
    RUNTIME_OVERLAY_DISTANCE_Z_INDEX.LOG_SCALE;

  return Math.max(
    RUNTIME_OVERLAY_DISTANCE_Z_INDEX.MIN,
    Math.min(
      RUNTIME_OVERLAY_DISTANCE_Z_INDEX.MAX,
      Math.round(RUNTIME_OVERLAY_DISTANCE_Z_INDEX.MAX - compressedDepth)
    )
  );
};

export type RuntimePointLabelRenderModel = {
  id: string;
  measurementId?: string;
  nodeId?: string;
  pointMarkerId?: string;
  coordinate: RuntimeCoordinate;
  coordinateCandidates?: readonly RuntimePointLabelCoordinateCandidate[];
  coordinateSelection?: RuntimePointLabelCoordinateSelection;
  markerPixelSize?: number;
  stemStartDistance?: number;
  anchorKind?: PointLabelAnchorKind;
  occlusionMode?: PointLabelOcclusionMode;
  preferredAttach?: PointLabelAttach;
  content: ReactNode;
  badgeContent?: ReactNode;
  markerOutlineWidth?: number;
  markerBackgroundColor?: string;
  markerTextColor?: string;
  lineColor?: string;
  textBackgroundColor?: string;
  textColor?: string;
  selectedBackgroundColor?: string;
  selectedTextColor?: string;
  selectedGlowColor?: string;
  selectedGlowRadiusPx?: number;
  preserveFillOnSelection?: boolean;
  hoverBackgroundColor?: string;
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  labelStyle?: PointLabelStyle;
  hideMarker?: boolean;
  collapse?: boolean;
  selected?: boolean;
  hideLabelAndStem?: boolean;
  onClick?: () => void;
  allowClickWhenBlocked?: boolean;
  onDoubleClick?: () => void;
  onLongPress?: () => void;
  markerOnlyPointerEvents?: boolean;
  allowLongPressWhenBlocked?: boolean;
  longPressDurationMs?: number;
};
