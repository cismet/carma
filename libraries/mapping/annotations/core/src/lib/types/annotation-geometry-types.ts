import type { Vector3 } from "three";
import type { Degrees, Meters, MetricVector3 } from "@carma-units";

import type { BaseAnnotationEntry } from "./annotation-entry";
import { ANNOTATION_TYPES, type AnnotationTypes } from "./annotation-types";

type AnnotationWgs84Coordinate = {
  longitude: Degrees;
  latitude: Degrees;
  altitude: Meters | undefined;
};

export type AnnotationMode =
  | AnnotationTypes["POINT"]
  | AnnotationTypes["DISTANCE"]
  | AnnotationTypes["POLYLINE"];

/** Geometry carried as `THREE.Vector3` in ECEF metres (EPSG:4978). */
type AnnotationEntry = BaseAnnotationEntry<AnnotationMode> & {
  geometryECEF: Vector3[] | Vector3;
  geometryWGS84: AnnotationWgs84Coordinate | AnnotationWgs84Coordinate[];
};

type AnnotationPointEntry = AnnotationEntry & {
  type: AnnotationTypes["POINT"] | AnnotationTypes["DISTANCE"];
  geometryECEF: Vector3;
  geometryWGS84: AnnotationWgs84Coordinate;
  radius?: number;
  verticalOffsetAnchorECEF?: MetricVector3;
};

export type PointMeasurementEntry = AnnotationPointEntry & {
  type: AnnotationTypes["POINT"];
};

export function isPointMeasurementEntry(
  entry: AnnotationEntry
): entry is PointMeasurementEntry {
  return entry && entry.type === ANNOTATION_TYPES.POINT;
}
