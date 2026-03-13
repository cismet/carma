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

export type RuntimePointLabelRenderModel = {
  id: string;
  coordinate: RuntimeCoordinate;
  content: string;
  markerContent?: string;
  markerBackgroundColor?: string;
  markerTextColor?: string;
  selected?: boolean;
  hideLabelAndStem?: boolean;
  onClick?: () => void;
};
