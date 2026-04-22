import { Cartesian3 } from "@carma-cesium";
import type { MetricVector3 } from "@carma-units";
import type { Altitude, LatLngAlt } from "@carma-geo/data-structures";

import type { BaseAnnotationEntry } from "./annotation-entry";
import {
  ANNOTATION_TYPES,
  type AnnotationTypes,
} from "./annotation-types";
export type AnnotationMode =
  | AnnotationTypes["POINT"]
  | AnnotationTypes["DISTANCE"]
  | AnnotationTypes["POLYLINE"];

export type AnnotationEntry = BaseAnnotationEntry<AnnotationMode> & {
  geometryECEF: Cartesian3[] | Cartesian3;
  geometryWGS84:
    | (LatLngAlt.deg & {
        altitude: Altitude.EllipsoidalWGS84Meters;
      })
    | Array<
        LatLngAlt.deg & {
          altitude: Altitude.EllipsoidalWGS84Meters;
        }
      >;
};

export type AnnotationPointEntry = AnnotationEntry & {
  type: AnnotationTypes["POINT"] | AnnotationTypes["DISTANCE"];
  geometryECEF: Cartesian3;
  geometryWGS84: LatLngAlt.deg & {
    altitude: Altitude.EllipsoidalWGS84Meters;
  };
  radius?: number;
  verticalOffsetAnchorECEF?: MetricVector3;
};

export type PointMeasurementEntry = AnnotationPointEntry & {
  type: AnnotationTypes["POINT"];
};

export type DistancePointEntry = AnnotationPointEntry & {
  type: AnnotationTypes["DISTANCE"];
};

export function isPointAnnotationEntry(
  entry: AnnotationEntry
): entry is AnnotationPointEntry {
  return (
    entry &&
    (entry.type === ANNOTATION_TYPES.POINT ||
      entry.type === ANNOTATION_TYPES.DISTANCE)
  );
}

export function isPointMeasurementEntry(
  entry: AnnotationEntry
): entry is PointMeasurementEntry {
  return entry && entry.type === ANNOTATION_TYPES.POINT;
}

export function isDistancePointEntry(
  entry: AnnotationEntry
): entry is DistancePointEntry {
  return entry && entry.type === ANNOTATION_TYPES.DISTANCE;
}
