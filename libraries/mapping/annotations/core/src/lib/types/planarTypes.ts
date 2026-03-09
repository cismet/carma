import type { Cartesian3Json } from "@carma/cesium";

import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_POLYLINE,
} from "./annotationTypes";
import type { LinearSegmentLineMode } from "./linearSegment";

export const PLANAR_POLYGON_SOURCE_KINDS = [
  ANNOTATION_TYPE_POLYLINE,
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
] as const;

export type PlanarPolygonSourceKind =
  (typeof PLANAR_POLYGON_SOURCE_KINDS)[number];

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

export type PlanarPolygonGroup = {
  id: string;
  name?: string;
  hidden?: boolean;
  measurementKind: PlanarPolygonSourceKind;
  segmentLineMode?: LinearSegmentLineMode;
  verticalOffsetMeters?: number;
  vertexPointIds: string[];
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
  surfaceType?: "roof" | "facade" | "terrain" | "footprint";
};
