import type { RuntimeCoordinate } from "../store";
import type {
  PointLabelAnchorKind,
  PointLabelOcclusionMode,
} from "@carma-providers/label-overlay";

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

export type RuntimePointLabelRenderModel = {
  id: string;
  measurementId?: string;
  nodeId?: string;
  coordinate: RuntimeCoordinate;
  anchorKind?: PointLabelAnchorKind;
  occlusionMode?: PointLabelOcclusionMode;
  content: string;
  markerContent?: string;
  markerBackgroundColor?: string;
  markerTextColor?: string;
  selected?: boolean;
  hideLabelAndStem?: boolean;
  onClick?: () => void;
  onLongPress?: () => void;
  longPressDurationMs?: number;
};
