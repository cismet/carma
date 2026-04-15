import { Cartesian3 } from "@carma-cesium";
import type { MetricVector3 } from "@carma-units";
import type { Altitude, LatLngAlt } from "@carma-geo/data-structures";

import type { BaseAnnotationEntry } from "./annotation-entry";
import type { AnnotationPersistenceEnvelopeBase } from "./annotation-persistence-types";
import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  SELECT_TOOL_TYPE,
} from "./annotation-types";
export type AnnotationMode =
  | typeof SELECT_TOOL_TYPE
  | typeof ANNOTATION_TYPE_POINT
  | typeof ANNOTATION_TYPE_DISTANCE
  | typeof ANNOTATION_TYPE_POLYLINE;

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
  type: typeof ANNOTATION_TYPE_POINT | typeof ANNOTATION_TYPE_DISTANCE;
  geometryECEF: Cartesian3;
  geometryWGS84: LatLngAlt.deg & {
    altitude: Altitude.EllipsoidalWGS84Meters;
  };
  radius?: number;
  verticalOffsetAnchorECEF?: MetricVector3;
};

export type PointMeasurementEntry = AnnotationPointEntry & {
  type: typeof ANNOTATION_TYPE_POINT;
};

export type DistancePointEntry = AnnotationPointEntry & {
  type: typeof ANNOTATION_TYPE_DISTANCE;
};

export type PointAnnotationEntry = AnnotationPointEntry;

export function isPointAnnotationEntry(
  entry: AnnotationEntry
): entry is AnnotationPointEntry {
  return (
    entry &&
    (entry.type === ANNOTATION_TYPE_POINT ||
      entry.type === ANNOTATION_TYPE_DISTANCE)
  );
}

export function isPointMeasurementEntry(
  entry: AnnotationEntry
): entry is PointMeasurementEntry {
  return entry && entry.type === ANNOTATION_TYPE_POINT;
}

export function isDistancePointEntry(
  entry: AnnotationEntry
): entry is DistancePointEntry {
  return entry && entry.type === ANNOTATION_TYPE_DISTANCE;
}

export type AnnotationCollection = AnnotationEntry[];

export type AnnotationPersistenceEnvelope =
  AnnotationPersistenceEnvelopeBase<AnnotationEntry>;
