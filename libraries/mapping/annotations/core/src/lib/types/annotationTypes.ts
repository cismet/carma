import type {
  DirectLineLabelMode,
  DistanceRelationLabelVisibilityByKind,
} from "../visualizers/distance/distanceRelationLabel.types";

export const MEASUREMENT_MODE_NONE = "none";
export const MEASUREMENT_MODE_POINT = "point_measure";
export const MEASUREMENT_MODE_DISTANCE = "point_query";
export const MEASUREMENT_MODE_POLYLINE = "polyline_measure";
export const MEASUREMENT_MODE_TRAVERSE = "traverse";
export const MEASUREMENT_MODE_ELEVATION = "elevation";

export type AnnotationMode =
  | typeof MEASUREMENT_MODE_NONE
  | typeof MEASUREMENT_MODE_POINT
  | typeof MEASUREMENT_MODE_DISTANCE
  | typeof MEASUREMENT_MODE_POLYLINE
  | typeof MEASUREMENT_MODE_TRAVERSE
  | typeof MEASUREMENT_MODE_ELEVATION;

export const SPATIAL_MARKUP_KINDS = [
  "point",
  "distance",
  "polyline",
  "area",
  "planar",
  "vertical",
  "label",
] as const;

export type SpatialMarkupKind = (typeof SPATIAL_MARKUP_KINDS)[number];
export type AnnotationShortLabelKind = SpatialMarkupKind;

const [
  POINT_KIND,
  DISTANCE_KIND,
  POLYLINE_KIND,
  AREA_KIND,
  PLANAR_KIND,
  VERTICAL_KIND,
  LABEL_KIND,
] = SPATIAL_MARKUP_KINDS;

export const SELECT_TOOL_TYPE = "select" as const;
export const SPATIAL_MARKUP_KIND_POINT = POINT_KIND;
export const SPATIAL_MARKUP_KIND_DISTANCE = DISTANCE_KIND;
export const SPATIAL_MARKUP_KIND_POLYLINE = POLYLINE_KIND;
export const SPATIAL_MARKUP_KIND_AREA = AREA_KIND;
export const SPATIAL_MARKUP_KIND_PLANAR = PLANAR_KIND;
export const SPATIAL_MARKUP_KIND_VERTICAL = VERTICAL_KIND;
export const SPATIAL_MARKUP_KIND_LABEL = LABEL_KIND;

export const POINT_MEASUREMENT_KINDS = [POINT_KIND] as const;
export type PointMeasurementKind = (typeof POINT_MEASUREMENT_KINDS)[number];

export const LINEAR_MEASUREMENT_KINDS = [DISTANCE_KIND, POLYLINE_KIND] as const;
export type LinearMeasurementKind = (typeof LINEAR_MEASUREMENT_KINDS)[number];

export const POLYGON_MEASUREMENT_KINDS = [
  AREA_KIND,
  PLANAR_KIND,
  VERTICAL_KIND,
] as const;
export type PolygonMeasurementKind = (typeof POLYGON_MEASUREMENT_KINDS)[number];

export const ANNOTATION_KINDS = [LABEL_KIND] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export const MEASUREMENT_FAMILY_KINDS = [
  ...POINT_MEASUREMENT_KINDS,
  ...LINEAR_MEASUREMENT_KINDS,
  ...POLYGON_MEASUREMENT_KINDS,
] as const;
export type AnnotationFamilyKind = (typeof MEASUREMENT_FAMILY_KINDS)[number];

export const MULTINODE_MEASUREMENT_KINDS = [
  ...LINEAR_MEASUREMENT_KINDS,
  ...POLYGON_MEASUREMENT_KINDS,
] as const;
export type MultinodeMeasurementKind =
  (typeof MULTINODE_MEASUREMENT_KINDS)[number];

export const MEASUREMENT_TOOL_TYPES = [
  SELECT_TOOL_TYPE,
  ...SPATIAL_MARKUP_KINDS,
] as const;
export type AnnotationToolType = (typeof MEASUREMENT_TOOL_TYPES)[number];

const POLYGON_KIND_SET = new Set<SpatialMarkupKind>(POLYGON_MEASUREMENT_KINDS);
const LINEAR_KIND_SET = new Set<SpatialMarkupKind>(LINEAR_MEASUREMENT_KINDS);
const POINT_KIND_SET = new Set<SpatialMarkupKind>(POINT_MEASUREMENT_KINDS);
const ANNOTATION_KIND_SET = new Set<SpatialMarkupKind>(ANNOTATION_KINDS);

export const isPolygonMeasurementType = (
  kind: SpatialMarkupKind
): kind is PolygonMeasurementKind => POLYGON_KIND_SET.has(kind);

export const isLinearMeasurementType = (
  kind: SpatialMarkupKind
): kind is LinearMeasurementKind => LINEAR_KIND_SET.has(kind);

export const isPointMeasurementType = (
  kind: SpatialMarkupKind
): kind is PointMeasurementKind => POINT_KIND_SET.has(kind);

export const isAnnotationType = (
  kind: SpatialMarkupKind
): kind is AnnotationKind => ANNOTATION_KIND_SET.has(kind);

export const KNOWN_MEASUREMENT_TYPES = [...MEASUREMENT_FAMILY_KINDS] as const;
export type KnownMeasurementType = (typeof KNOWN_MEASUREMENT_TYPES)[number];

export const KNOWN_ANNOTATION_TYPES = [...ANNOTATION_KINDS] as const;
export type KnownAnnotationType = (typeof KNOWN_ANNOTATION_TYPES)[number];

export type PointLabelMetricMode =
  | "elevation"
  | "absoluteElevation"
  | "none"
  | "distance";
export const DEFAULT_POINT_LABEL_METRIC_MODE: PointLabelMetricMode =
  "elevation";

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
export const PLANAR_POLYGON_SOURCE_KINDS = [
  SPATIAL_MARKUP_KIND_POLYLINE,
  SPATIAL_MARKUP_KIND_AREA,
] as const;
export type PlanarPolygonSourceKind =
  (typeof PLANAR_POLYGON_SOURCE_KINDS)[number];

export const PLANAR_SURFACE_TYPES = [
  "roof",
  "facade",
  "terrain",
  "footprint",
] as const;
export type PlanarSurfaceType = (typeof PLANAR_SURFACE_TYPES)[number];

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
  measurementKind?: PlanarPolygonSourceKind;
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
  surfaceType?: PlanarSurfaceType;
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

export type AnnotationLabelAnchor = {
  anchorPointId: string;
  compactContent?: string;
  collapseToCompact: boolean;
};

export type AnnotationLabelAppearance = {
  fontSizePx?: number;
  backgroundColor?: string;
  textColor?: string;
};

export type BaseAnnotationEntry<TMode extends string = string> = {
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
  labelAnchor?: AnnotationLabelAnchor;
  labelAppearance?: AnnotationLabelAppearance;
};

export type AnnotationGeometryPoint = {
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
  labelAnchor?: AnnotationLabelAnchor;
  labelAppearance?: AnnotationLabelAppearance;
};

export type AnnotationGeometryEdge = {
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

export type AnnotationPersistenceEnvelopeV2Base<TMeasurementEntry> = {
  version: 2;
  geometry: {
    points: AnnotationGeometryPoint[];
    edges: AnnotationGeometryEdge[];
  };
  tables: {
    measurements: TMeasurementEntry[];
    distanceRelations: PointDistanceRelation[];
    planarPolygonGroups: PlanarPolygonGroup[];
    planarPolygonGroupVertices: PlanarPolygonGroupVertex[];
  };
};
