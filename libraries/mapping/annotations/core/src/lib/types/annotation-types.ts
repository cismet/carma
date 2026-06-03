import type { MetricVector3 } from "@carma-units";

import type { LinearSegmentLineMode } from "./linear-segment";
// Semantic annotation identifiers
export const ANNOTATION_TYPES = {
  POINT: "point",
  DISTANCE: "distance",
  POLYLINE: "polyline",
  AREA_GROUND: "area",
  AREA_PLANAR: "planar",
  AREA_VERTICAL: "vertical",
  LABEL: "label",
} as const;

export const ANNOTATION_SELECT_TOOL_ID = "select";
export const ANNOTATION_AREA_PLANAR_BIGGEST_TRIANGLE_TOOL_ID =
  "planar-biggest-triangle";
export const ANNOTATION_AREA_PLANAR_PCA_TOOL_ID = "planar-pca";
export const ANNOTATION_AREA_PLANAR_TRAPEZOID_TOOL_ID =
  "planar-trapezoid";

export const ANNOTATION_TYPE_POINT = ANNOTATION_TYPES.POINT;
export const ANNOTATION_TYPE_DISTANCE = ANNOTATION_TYPES.DISTANCE;
export const ANNOTATION_TYPE_POLYLINE = ANNOTATION_TYPES.POLYLINE;
export const ANNOTATION_TYPE_AREA_GROUND = ANNOTATION_TYPES.AREA_GROUND;
export const ANNOTATION_TYPE_AREA_PLANAR = ANNOTATION_TYPES.AREA_PLANAR;
export const ANNOTATION_TYPE_AREA_VERTICAL = ANNOTATION_TYPES.AREA_VERTICAL;
export const ANNOTATION_TYPE_LABEL = ANNOTATION_TYPES.LABEL;

export type AnnotationTypes = typeof ANNOTATION_TYPES;

export type AnnotationType = AnnotationTypes[keyof AnnotationTypes];

export type AnnotationToolId =
  | AnnotationType
  | typeof ANNOTATION_SELECT_TOOL_ID
  | typeof ANNOTATION_AREA_PLANAR_BIGGEST_TRIANGLE_TOOL_ID
  | typeof ANNOTATION_AREA_PLANAR_PCA_TOOL_ID
  | typeof ANNOTATION_AREA_PLANAR_TRAPEZOID_TOOL_ID;

export const isAreaAnnotationType = (
  annotationType: AnnotationToolId
): annotationType is
  | AnnotationTypes["AREA_GROUND"]
  | AnnotationTypes["AREA_VERTICAL"]
  | AnnotationTypes["AREA_PLANAR"] =>
  annotationType === ANNOTATION_TYPES.AREA_GROUND ||
  annotationType === ANNOTATION_TYPES.AREA_VERTICAL ||
  annotationType === ANNOTATION_TYPES.AREA_PLANAR;

export type PlanarPolygonType =
  | AnnotationTypes["AREA_PLANAR"]
  | AnnotationTypes["AREA_VERTICAL"];

export type PolygonType = AnnotationTypes["AREA_GROUND"] | PlanarPolygonType;

export type NodeChainAnnotationType =
  | AnnotationTypes["DISTANCE"]
  | AnnotationTypes["POLYLINE"]
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
};

export type NodeChainAnnotation = NodeChainAnnotationBase & {
  type: NodeChainAnnotationType;
};

export type DerivedNodeChainAnnotationGeometry = {
  plane?: PlanarPolygonPlane;
  planarPolygonLocalFrame?: PlanarPolygonLocalFrame;
  perimeterMeters: number;
  areaSquareMeters: number;
  verticalityDeg?: number;
  bearingRad?: number;
};

export type DerivedNodeChainAnnotation = NodeChainAnnotation &
  DerivedNodeChainAnnotationGeometry;
