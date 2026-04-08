import type { ReactNode } from "react";
import type {
  PointLabelAnchorKind,
  PointLabelOcclusionMode,
} from "@carma-providers/label-overlay";

import type { RuntimeCoordinate } from "../store";

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
};

export type RuntimePolygonFillRenderModel = {
  id: string;
  coordinates: readonly RuntimeCoordinate[];
  fill: string;
  placement?: "ground" | "coplanar";
  selected?: boolean;
};

export type RuntimePointLabelRenderModel = {
  id: string;
  measurementId?: string;
  nodeId?: string;
  coordinate: RuntimeCoordinate;
  markerPixelSize?: number;
  anchorKind?: PointLabelAnchorKind;
  occlusionMode?: PointLabelOcclusionMode;
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
  labelStyle?: "auto" | "capsule";
  hideMarker?: boolean;
  collapse?: boolean;
  forceCollapse?: boolean;
  selected?: boolean;
  hideLabelAndStem?: boolean;
  onClick?: () => void;
  onLongPress?: () => void;
  longPressDurationMs?: number;
};
