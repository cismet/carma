import type { MetricVector3 } from "@carma-units";

import type { LinearSegmentLineMode } from "./linear-segment";
// Tool and annotation identifiers
export const ANNOTATION_TYPES = {
  POINT: "point",
  DISTANCE: "distance",
  POLYLINE: "polyline",
  AREA_GROUND: "area",
  AREA_PLANAR: "planar",
  AREA_VERTICAL: "vertical",
  LABEL: "label",
} as const;

export const ANNOTATION_TOOL_TYPES = {
  SELECT: "select",
  ...ANNOTATION_TYPES,
} as const;

export const SELECT_TOOL_TYPE = ANNOTATION_TOOL_TYPES.SELECT;
export const ANNOTATION_TYPE_POINT = ANNOTATION_TYPES.POINT;
export const ANNOTATION_TYPE_DISTANCE = ANNOTATION_TYPES.DISTANCE;
export const ANNOTATION_TYPE_POLYLINE = ANNOTATION_TYPES.POLYLINE;
export const ANNOTATION_TYPE_AREA_GROUND = ANNOTATION_TYPES.AREA_GROUND;
export const ANNOTATION_TYPE_AREA_PLANAR = ANNOTATION_TYPES.AREA_PLANAR;
export const ANNOTATION_TYPE_AREA_VERTICAL = ANNOTATION_TYPES.AREA_VERTICAL;
export const ANNOTATION_TYPE_LABEL = ANNOTATION_TYPES.LABEL;

export type AnnotationType =
  (typeof ANNOTATION_TYPES)[keyof typeof ANNOTATION_TYPES];
export type AnnotationShortLabelKind = AnnotationType;

export type AnnotationToolType =
  (typeof ANNOTATION_TOOL_TYPES)[keyof typeof ANNOTATION_TOOL_TYPES];

export const isAreaToolType = (
  toolType: AnnotationToolType
): toolType is
  | typeof ANNOTATION_TYPES.AREA_GROUND
  | typeof ANNOTATION_TYPES.AREA_VERTICAL
  | typeof ANNOTATION_TYPES.AREA_PLANAR =>
  toolType === ANNOTATION_TYPES.AREA_GROUND ||
  toolType === ANNOTATION_TYPES.AREA_VERTICAL ||
  toolType === ANNOTATION_TYPES.AREA_PLANAR;

export type PlanarPolygonType =
  | typeof ANNOTATION_TYPES.AREA_PLANAR
  | typeof ANNOTATION_TYPES.AREA_VERTICAL;

export type GroundPolygonType = typeof ANNOTATION_TYPES.AREA_GROUND;

export type PolygonType = GroundPolygonType | PlanarPolygonType;
export type PolygonAreaType = PolygonType;

export type NodeChainAnnotationType =
  | typeof ANNOTATION_TYPES.DISTANCE
  | typeof ANNOTATION_TYPES.POLYLINE
  | PolygonType;

export type PlanarPolygonPlane = {
  anchorECEF: MetricVector3;
  normalECEF: MetricVector3;
};

export type PlanarPolygonLocalFrame = {
  originECEF: MetricVector3;
  eastECEF: MetricVector3;
  northECEF: MetricVector3;
  upECEF: MetricVector3;
};

type NodeChainAnnotationBase = {
  id: string;
  name?: string;
  hidden?: boolean;
  segmentLineMode?: LinearSegmentLineMode;
  distanceLineVisibility?: {
    direct: boolean;
    vertical: boolean;
    horizontal: boolean;
  };
  verticalOffsetMeters?: number;
  nodeIds: string[];
  edgeRelationIds: string[];
  distanceMeasurementStartPointId?: string;
  closed: boolean;
  planeLocked: boolean;
  plane?: PlanarPolygonPlane;
  planarPolygonLocalFrame?: PlanarPolygonLocalFrame;
  perimeterMeters?: number;
  areaSquareMeters?: number;
  verticalityDeg?: number;
  bearingDeg?: number;
};

export type NodeChainAnnotation = NodeChainAnnotationBase & {
  type: NodeChainAnnotationType;
};
