import { Cartesian3, type Cartographic } from "@carma/cesium";

export enum MeasurementMode {
  NONE = "none",
  PointMeasure = "point_measure",
  PointQuery = "point_query",
  PolylineMeasure = "polyline_measure",
  Traverse = "traverse",
  Elevation = "elevation",
}

export type PointLabelMetricMode =
  | "elevation"
  | "absoluteElevation"
  | "none"
  | "distance";
export const DEFAULT_POINT_LABEL_METRIC_MODE: PointLabelMetricMode =
  "elevation";

export type ReferenceLineLabelKind = "direct" | "vertical" | "horizontal";

export type DistanceRelationLabelVisibilityByKind = Partial<
  Record<ReferenceLineLabelKind, boolean>
>;
export type DirectLineLabelMode = "segment" | "cumulative" | "none";

export type PolylinePointLabelMode =
  | "cumulativeDistance"
  | "elevationSinceStart"
  | "elevationSinceLastNode";
export const DEFAULT_POLYLINE_POINT_LABEL_MODE: PolylinePointLabelMode =
  "cumulativeDistance";
export type PolylineSegmentLineMode = "direct" | "components";

export type SurfaceType = "roof" | "facade" | "terrain" | "footprint";

export type SerializableCartesian3 = {
  x: number;
  y: number;
  z: number;
};

export type PlanarPolygonPlane = {
  anchorECEF: SerializableCartesian3;
  normalECEF: SerializableCartesian3;
};

export type PlanarPolygonLocalFrame = {
  originECEF: SerializableCartesian3;
  eastECEF: SerializableCartesian3;
  northECEF: SerializableCartesian3;
  upECEF: SerializableCartesian3;
};

export type PlanarPolygonGroup = {
  id: string;
  name?: string;
  hidden?: boolean;
  segmentLineMode?: PolylineSegmentLineMode;
  verticalOffsetMeters?: number;
  vertexPointIds: string[];
  edgeRelationIds: string[];
  distanceMeasurementStartPointId?: string;
  closed: boolean;
  planeLocked: boolean;
  plane?: PlanarPolygonPlane;
  planarPolygonLocalFrame?: PlanarPolygonLocalFrame;
  areaSquareMeters?: number;
  verticalityDeg?: number;
  surfaceType?: SurfaceType;
};

export type PolylineCollection = {
  id: string;
  name?: string;
  vertexPointIds: string[];
  edgeRelationIds: string[];
  distanceMeasurementStartPointId: string | null;
  vertexHeightsMeters: number[];
  segmentLengthsMeters: number[];
  segmentLengthsCumulativeMeters: number[];
  totalLengthMeters: number;
};

export type PointDistanceRelation = {
  id: string;
  edgeId: string;
  pointAId: string;
  pointBId: string;
  // The anchor point defines the "from" side for component visualization.
  anchorPointId: string;
  polygonGroupId?: string;
  showDirectLine?: boolean;
  showVerticalLine?: boolean;
  showHorizontalLine?: boolean;
  showComponentLines?: boolean;
  labelVisibilityByKind?: DistanceRelationLabelVisibilityByKind;
  directLabelMode?: DirectLineLabelMode;
};

export type PointReferenceLineAnnotation = {
  showDirectLine?: boolean;
  showComponentLines?: boolean;
};

export type GeomPoint = Partial<Cartographic> & {
  longitude: number;
  latitude: number;
  height: number;
};

type GeomPolyline = GeomPoint[];

export type MeasurementEntry = {
  id: string;
  type: MeasurementMode;
  timestamp: number;
  index?: number;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  auxiliaryLabelAnchor?: boolean;
  geometryECEF: Cartesian3[] | Cartesian3;
  geometryWGS84: GeomPoint | GeomPolyline;
  metadata?: unknown;
  derived?: unknown;
  temporary?: boolean;
  pointLabelMode?: PointLabelMetricMode;
};

export type PointMeasurementEntry = MeasurementEntry & {
  type: MeasurementMode.PointQuery;
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
  return entry && entry.type === MeasurementMode.PointQuery;
}

export type TraverseMeasurementEntry = MeasurementEntry & {
  type: MeasurementMode.Traverse;
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
  return entry && entry.type === MeasurementMode.Traverse;
}

export type MeasurementCollection = MeasurementEntry[];

export type MeasurementGeometryPoint = {
  id: string;
  longitude: number;
  latitude: number;
  height: number;
  geometryECEF: SerializableCartesian3;
  hidden?: boolean;
  locked?: boolean;
  pointLabelMode?: PointLabelMetricMode;
  auxiliaryLabelAnchor?: boolean;
  verticalOffsetAnchorECEF?: SerializableCartesian3;
};

export type MeasurementGeometryEdge = {
  id: string;
  pointAId: string;
  pointBId: string;
};

export type PlanarPolygonGroupVertex = {
  id: string;
  groupId: string;
  pointId: string;
  order: number;
};

export type MeasurementPersistenceEnvelopeV2 = {
  version: 2;
  geometry: {
    points: MeasurementGeometryPoint[];
    edges: MeasurementGeometryEdge[];
  };
  tables: {
    measurements: MeasurementCollection;
    distanceRelations: PointDistanceRelation[];
    planarPolygonGroups: PlanarPolygonGroup[];
    planarPolygonGroupVertices: PlanarPolygonGroupVertex[];
  };
};
