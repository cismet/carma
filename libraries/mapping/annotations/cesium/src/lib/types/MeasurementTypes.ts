import { Cartesian3 } from "@carma/cesium";
import {
  MeasurementMode as SharedMeasurementMode,
  DEFAULT_LINEAR_SEGMENT_LINE_MODE,
  DEFAULT_POINT_LABEL_METRIC_MODE,
  DEFAULT_POLYLINE_POINT_LABEL_MODE,
  LINEAR_SEGMENT_LINE_MODES,
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  type BaseMeasurementEntry,
  type MeasurementPersistenceEnvelopeV2Base,
  type PointReferenceLineAnnotation,
  type SerializableCartesian3,
} from "@carma-commons/measurements";

export {
  DEFAULT_LINEAR_SEGMENT_LINE_MODE,
  DEFAULT_POINT_LABEL_METRIC_MODE,
  DEFAULT_POLYLINE_POINT_LABEL_MODE,
  LINEAR_SEGMENT_LINE_MODES,
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  SharedMeasurementMode as MeasurementMode,
};

export type {
  DirectLineLabelMode,
  DistanceRelationLabelVisibilityByKind,
  LinearSegmentLineMode,
  MeasurementGeometryEdge,
  MeasurementGeometryPoint,
  MeasurementLabelAnchor,
  MeasurementLabelAppearance,
  PlanarMeasurementKind,
  PlanarPolygonGroup,
  PlanarPolygonGroupVertex,
  PlanarPolygonLocalFrame,
  PlanarPolygonPlane,
  PointDistanceRelation,
  PointLabelMetricMode,
  PointReferenceLineAnnotation,
  PolylineCollection,
  PolylinePointLabelMode,
  PolylineSegmentLineMode,
  ReferenceLineLabelKind,
  SerializableCartesian3,
  SurfaceType,
} from "@carma-commons/measurements";

export type GeomPoint = {
  longitude: number;
  latitude: number;
  height: number;
};

type GeomPolyline = GeomPoint[];

export type MeasurementEntry = BaseMeasurementEntry<SharedMeasurementMode> & {
  geometryECEF: Cartesian3[] | Cartesian3;
  geometryWGS84: GeomPoint | GeomPolyline;
};

export type PointMeasurementEntry = MeasurementEntry & {
  type: typeof SharedMeasurementMode.PointQuery;
  geometryECEF: Cartesian3;
  geometryWGS84: GeomPoint;
  radius?: number;
  isFacadeAutoCorner?: boolean;
  referenceLineAnnotation?: PointReferenceLineAnnotation;
  verticalOffsetAnchorECEF?: SerializableCartesian3;
  /** True when point was created ad-hoc in distance mode (PointQuery).
   *  Such points can be auto-removed once no relation references them. */
  distanceAdhocNode?: boolean;
  /** Set when this point was created exclusively as a node for a distance relation.
   *  Used to auto-delete the point when its owning relation is removed. */
  distanceRelationId?: string;
};

export function isPointMeasurementEntry(
  entry: MeasurementEntry
): entry is PointMeasurementEntry {
  return entry && entry.type === SharedMeasurementMode.PointQuery;
}

export type TraverseMeasurementEntry = MeasurementEntry & {
  type: typeof SharedMeasurementMode.Traverse;
  geometryECEF: Cartesian3[];
  geometryWGS84: GeomPolyline;
  heightOffset?: number;
  shouldRebuildEntry?: boolean;
  derived?: {
    segmentLengths: number[];
    segmentLengthsCumulative: number[];
    totalLength: number;
  };
};

export function isTraverseMeasurementEntry(
  entry: MeasurementEntry
): entry is TraverseMeasurementEntry {
  return entry && entry.type === SharedMeasurementMode.Traverse;
}

export type MeasurementCollection = MeasurementEntry[];

export type MeasurementPersistenceEnvelopeV2 =
  MeasurementPersistenceEnvelopeV2Base<MeasurementEntry>;
