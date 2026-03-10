import type { Cartesian3Json } from "@carma/cesium";

import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_POLYLINE,
} from "./annotationTypes";
import type { LinearSegmentLineMode } from "./linearSegment";

export type PlanarPolygonType =
  | typeof ANNOTATION_TYPE_AREA_PLANAR
  | typeof ANNOTATION_TYPE_AREA_VERTICAL;

export type GroundPolygonType = typeof ANNOTATION_TYPE_AREA_GROUND;

export type PlanarPolygonAreaType = GroundPolygonType | PlanarPolygonType;

export type PlanarMeasurementType =
  | typeof ANNOTATION_TYPE_POLYLINE
  | PlanarPolygonAreaType;

export type PlanarPolygonPlane = {
  anchorECEF: Cartesian3Json;
  normalECEF: Cartesian3Json;
};

export type PlanarPolygonLocalFrame = {
  originECEF: Cartesian3Json;
  eastECEF: Cartesian3Json;
  northECEF: Cartesian3Json;
  upECEF: Cartesian3Json;
};

type PlanarMeasurementGroupBase = {
  id: string;
  name?: string;
  hidden?: boolean;
  segmentLineMode?: LinearSegmentLineMode;
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

export type PlanarPolylineGroup = PlanarMeasurementGroupBase & {
  type: typeof ANNOTATION_TYPE_POLYLINE;
};

export type PlanarPolygonGroup = PlanarMeasurementGroupBase & {
  type: PlanarPolygonAreaType;
};

export type PlanarMeasurementGroup = PlanarPolylineGroup | PlanarPolygonGroup;
