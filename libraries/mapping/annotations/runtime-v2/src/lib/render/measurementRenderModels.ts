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

export type RuntimePointLabelCoordinateCandidate = {
  coordinate: RuntimeCoordinate;
  nodeId?: string;
};

export type RuntimeDistanceTriangleOverlayRenderModel = {
  measurementId?: string;
  anchorCoordinateSelection?: RuntimePointLabelCoordinateSelection;
};

export type RuntimePointMarkerRenderModel = {
  id: string;
  coordinate: RuntimeCoordinate;
  pixelSize: number;
  fill: string;
  outline: string;
  outlineWidth: number;
};

export type RuntimeEdgeRenderModel = {
  id: string;
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
      Math.round(
        RUNTIME_OVERLAY_DISTANCE_Z_INDEX.MAX - compressedDepth
      )
    )
  );
};

export type RuntimePointLabelRenderModel = {
  id: string;
  measurementId?: string;
  nodeId?: string;
  coordinate: RuntimeCoordinate;
  coordinateCandidates?: readonly RuntimePointLabelCoordinateCandidate[];
  coordinateSelection?: RuntimePointLabelCoordinateSelection;
  markerPixelSize?: number;
  anchorKind?: PointLabelAnchorKind;
  occlusionMode?: PointLabelOcclusionMode;
  preferredAttach?: PointLabelAttach;
  content: ReactNode;
  markerContent?: ReactNode;
  compactContent?: ReactNode;
  markerBackgroundColor?: string;
  markerTextColor?: string;
  textBackgroundColor?: string;
  textColor?: string;
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  labelStyle?: PointLabelStyle;
  hideMarker?: boolean;
  collapse?: boolean;
  forceCollapse?: boolean;
  selected?: boolean;
  hideLabelAndStem?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onLongPress?: () => void;
  longPressDurationMs?: number;
};
