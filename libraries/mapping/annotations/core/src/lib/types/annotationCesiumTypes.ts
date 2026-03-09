import { Cartesian3, type Cartesian3Json } from "@carma/cesium";
import type { Altitude, LatLngAlt } from "@carma/geo/types";

import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  SELECT_TOOL_TYPE,
} from "./annotationTypes";
import type { BaseAnnotationEntry } from "./annotationEntry";
import type { AnnotationPersistenceEnvelopeV2Base } from "./annotationPersistenceTypes";
import type { PointReferenceLineAnnotation } from "./distanceRelation";

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
  isFacadeAutoCorner?: boolean;
  referenceLineAnnotation?: PointReferenceLineAnnotation;
  verticalOffsetAnchorECEF?: Cartesian3Json;
  distanceAdhocNode?: boolean;
  distanceRelationId?: string;
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

export type AnnotationPersistenceEnvelopeV2 =
  AnnotationPersistenceEnvelopeV2Base<AnnotationEntry>;
