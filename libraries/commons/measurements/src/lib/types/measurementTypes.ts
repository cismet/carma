export const MeasurementMode = {
  NONE: "none",
  PointMeasure: "point_measure",
  PointQuery: "point_query",
  PolylineMeasure: "polyline_measure",
  Traverse: "traverse",
  Elevation: "elevation",
} as const;
export type MeasurementMode =
  (typeof MeasurementMode)[keyof typeof MeasurementMode];

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
export const LINEAR_SEGMENT_LINE_MODES = ["direct", "components"] as const;
export type LinearSegmentLineMode = (typeof LINEAR_SEGMENT_LINE_MODES)[number];
const [DIRECT_SEGMENT_LINE_MODE, COMPONENTS_SEGMENT_LINE_MODE] =
  LINEAR_SEGMENT_LINE_MODES;
export const LINEAR_SEGMENT_LINE_MODE_DIRECT = DIRECT_SEGMENT_LINE_MODE;
export const LINEAR_SEGMENT_LINE_MODE_COMPONENTS = COMPONENTS_SEGMENT_LINE_MODE;
export const DEFAULT_LINEAR_SEGMENT_LINE_MODE =
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS;
export type PolylineSegmentLineMode = LinearSegmentLineMode;
export type PlanarMeasurementKind = "polyline" | "area";

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
  measurementKind?: PlanarMeasurementKind;
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

export type MeasurementLabelAnchor = {
  anchorPointId: string;
  compactContent?: string;
  collapseToCompact: boolean;
};

export type MeasurementLabelAppearance = {
  fontSizePx?: number;
  backgroundColor?: string;
  textColor?: string;
};

export type BaseMeasurementEntry<TMode extends string = string> = {
  id: string;
  type: TMode;
  timestamp: number;
  isLivePreview?: boolean;
  index?: number;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  temporary?: boolean;
  auxiliaryLabelAnchor?: boolean;
  metadata?: unknown;
  derived?: unknown;
  pointLabelMode?: PointLabelMetricMode;
  labelAnchor?: MeasurementLabelAnchor;
  labelAppearance?: MeasurementLabelAppearance;
};

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
  labelAnchor?: MeasurementLabelAnchor;
  labelAppearance?: MeasurementLabelAppearance;
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

export type MeasurementPersistenceEnvelopeV2Base<TMeasurementEntry> = {
  version: 2;
  geometry: {
    points: MeasurementGeometryPoint[];
    edges: MeasurementGeometryEdge[];
  };
  tables: {
    measurements: TMeasurementEntry[];
    distanceRelations: PointDistanceRelation[];
    planarPolygonGroups: PlanarPolygonGroup[];
    planarPolygonGroupVertices: PlanarPolygonGroupVertex[];
  };
};
