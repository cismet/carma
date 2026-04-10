import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
} from "@carma-mapping/annotations/core";

import type {
  RuntimeAnnotationEntry,
  RuntimeCoordinate,
} from "../store/annotationsStore.types";

export type RuntimeAnnotationGeoJsonFeatureCollection = FeatureCollection<
  Geometry,
  Record<string, unknown>
>;

const EXPORT_VERSION = 1 as const;

const POLYGON_TOOL_TYPES = new Set<string>([
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
]);

const POINT_LIKE_TOOL_TYPES = new Set<string>([
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_LABEL,
]);

const normalizePropertyValue = (value: unknown): unknown => {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizePropertyValue(entry))
      .filter((entry) => entry !== undefined);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => {
        const normalizedEntry = normalizePropertyValue(entry);
        return normalizedEntry === undefined ? [] : [[key, normalizedEntry]];
      })
    );
  }

  return String(value);
};

const normalizePropertyRecord = (
  value: Record<string, unknown>
): Record<string, unknown> =>
  (normalizePropertyValue(value) as Record<string, unknown>) ?? {};

const toGeoJsonPosition = ({
  longitude,
  latitude,
  altitude,
}: RuntimeCoordinate): Position => [longitude, latitude, altitude];

const resolveGeometry = ({
  toolType,
  coordinates,
}: {
  toolType: string;
  coordinates: readonly RuntimeCoordinate[];
}): Geometry | null => {
  if (coordinates.length === 0) {
    return null;
  }

  if (POLYGON_TOOL_TYPES.has(toolType) && coordinates.length >= 3) {
    const ring = coordinates.map(toGeoJsonPosition);
    return {
      type: "Polygon",
      coordinates: [[...ring, ring[0]!]],
    };
  }

  if (!POINT_LIKE_TOOL_TYPES.has(toolType) && coordinates.length >= 2) {
    return {
      type: "LineString",
      coordinates: coordinates.map(toGeoJsonPosition),
    };
  }

  return {
    type: "Point",
    coordinates: toGeoJsonPosition(coordinates[0]!),
  };
};

export const sanitizeRuntimeAnnotationExportFileSegment = (
  value: string | undefined | null
): string => {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "annotation";
};

export const resolveRuntimeAnnotationExportDescriptor = (
  annotation: RuntimeAnnotationEntry
) => ({
  kind: annotation.toolType,
  name:
    annotation.displayName?.trim() ||
    annotation.shortLabel?.trim() ||
    annotation.id,
});

export const buildRuntimeAnnotationGeoJsonFeatureCollection = ({
  annotation,
  coordinates,
}: {
  annotation: RuntimeAnnotationEntry;
  coordinates: readonly RuntimeCoordinate[];
}): RuntimeAnnotationGeoJsonFeatureCollection | null => {
  const geometry = resolveGeometry({
    toolType: annotation.toolType,
    coordinates,
  });

  if (!geometry) {
    return null;
  }

  const feature: Feature<Geometry, Record<string, unknown>> = {
    type: "Feature",
    id: annotation.id,
    geometry,
    properties: {
      exportVersion: EXPORT_VERSION,
      annotationId: annotation.id,
      annotationKind: annotation.toolType,
      annotation: normalizePropertyRecord(
        annotation as Record<string, unknown>
      ),
      nodes: coordinates.map((coordinate, order) => ({
        order,
        coordinate,
      })),
    },
  };

  return {
    type: "FeatureCollection",
    features: [feature],
  };
};
