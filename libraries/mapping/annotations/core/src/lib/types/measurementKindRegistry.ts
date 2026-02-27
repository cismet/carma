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
export type MeasurementShortLabelKind = SpatialMarkupKind;

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
export type MeasurementFamilyKind = (typeof MEASUREMENT_FAMILY_KINDS)[number];

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
export type MeasurementToolType = (typeof MEASUREMENT_TOOL_TYPES)[number];

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
