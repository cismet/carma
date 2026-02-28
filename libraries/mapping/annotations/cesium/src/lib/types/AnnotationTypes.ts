import { Cartesian3 } from "@carma/cesium";
import type {
  BaseAnnotationEntry,
  AnnotationPersistenceEnvelopeV2Base,
  PointReferenceLineAnnotation,
  SerializableCartesian3,
} from "@carma-mapping/annotations/core";

export const MEASUREMENT_MODE_NONE = "none";
export const MEASUREMENT_MODE_POINT = "point_measure";
export const MEASUREMENT_MODE_DISTANCE = "point_query";
export const MEASUREMENT_MODE_POLYLINE = "polyline_measure";
export const MEASUREMENT_MODE_TRAVERSE = "traverse";
export const MEASUREMENT_MODE_ELEVATION = "elevation";

export const LINEAR_SEGMENT_LINE_MODES = ["direct", "components"] as const;
const [DIRECT_SEGMENT_LINE_MODE, COMPONENTS_SEGMENT_LINE_MODE] =
  LINEAR_SEGMENT_LINE_MODES;
export const LINEAR_SEGMENT_LINE_MODE_DIRECT = DIRECT_SEGMENT_LINE_MODE;
export const LINEAR_SEGMENT_LINE_MODE_COMPONENTS = COMPONENTS_SEGMENT_LINE_MODE;
export const DEFAULT_LINEAR_SEGMENT_LINE_MODE =
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS;
export const DEFAULT_POINT_LABEL_METRIC_MODE = "elevation" as const;
export const DEFAULT_POLYLINE_POINT_LABEL_MODE =
  "cumulativeDistance" as const;
export const PLANAR_POLYGON_SOURCE_KINDS = ["polyline", "area"] as const;
export const PLANAR_SURFACE_TYPES = [
  "roof",
  "facade",
  "terrain",
  "footprint",
] as const;

export type {
  DirectLineLabelMode,
  DistanceRelationLabelVisibilityByKind,
  LinearSegmentLineMode,
  AnnotationGeometryEdge,
  AnnotationGeometryPoint,
  AnnotationLabelAnchor,
  AnnotationLabelAppearance,
  PlanarPolygonSourceKind,
  PlanarPolygonGroup,
  PlanarPolygonGroupVertex,
  PlanarPolygonLocalFrame,
  PlanarPolygonPlane,
  PointDistanceRelation,
  PointLabelMetricMode,
  PointReferenceLineAnnotation,
  PolylineCollection,
  PolylinePointLabelMode,
  ReferenceLineLabelKind,
  SerializableCartesian3,
  PlanarSurfaceType,
} from "@carma-mapping/annotations/core";

export type AnnotationMode =
  | typeof MEASUREMENT_MODE_NONE
  | typeof MEASUREMENT_MODE_POINT
  | typeof MEASUREMENT_MODE_DISTANCE
  | typeof MEASUREMENT_MODE_POLYLINE
  | typeof MEASUREMENT_MODE_TRAVERSE
  | typeof MEASUREMENT_MODE_ELEVATION;

export type GeomPoint = {
  longitude: number;
  latitude: number;
  height: number;
};

type GeomPolyline = GeomPoint[];

export type AnnotationEntry = BaseAnnotationEntry<AnnotationMode> & {
  geometryECEF: Cartesian3[] | Cartesian3;
  geometryWGS84: GeomPoint | GeomPolyline;
};

export type PointAnnotationEntry = AnnotationEntry & {
  type: typeof MEASUREMENT_MODE_DISTANCE;
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

export function isPointAnnotationEntry(
  entry: AnnotationEntry
): entry is PointAnnotationEntry {
  return entry && entry.type === MEASUREMENT_MODE_DISTANCE;
}

export type TraverseAnnotationEntry = AnnotationEntry & {
  type: typeof MEASUREMENT_MODE_TRAVERSE;
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

export function isTraverseAnnotationEntry(
  entry: AnnotationEntry
): entry is TraverseAnnotationEntry {
  return entry && entry.type === MEASUREMENT_MODE_TRAVERSE;
}

export type AnnotationCollection = AnnotationEntry[];

export type AnnotationPersistenceEnvelopeV2 =
  AnnotationPersistenceEnvelopeV2Base<AnnotationEntry>;
