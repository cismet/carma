import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import { formatLengthMeters } from "@carma-units";
import type { AnnotationsRuntimeFormatOptions } from "@carma-mapping/annotations/runtime";
import {
  ANNOTATION_ELEVATION_DISPLAY_MODES,
  type StoredAnnotation,
  type CesiumGeographicCoordinate,
  type AnnotationElevationDisplayMode,
  type AnnotationNode,
} from "@carma-mapping/annotations/runtime";
const { POINT: ANNOTATION_TYPE_POINT } = ANNOTATION_TYPES;

const pointElevationDisplayDefaults = Object.freeze({
  neutralThresholdMeters: 0.03,
  glyphs: Object.freeze({
    up: "↥",
    down: "↧",
  }),
});

export type PointElevationTextLabels = Readonly<{
  absolutePrefix: string;
  relativeHeightSuffix: string;
  missingReference: string;
}>;

const defaultPointElevationTextLabels = Object.freeze<PointElevationTextLabels>(
  {
    absolutePrefix: "NHN",
    relativeHeightSuffix: "relative Höhe über Bezugspunkt",
    missingReference: "Keine Referenzhöhe gesetzt.",
  }
);

export const resolvePointElevationReferenceAnnotationId = ({
  annotationEntries,
  configuredReferenceAnnotationId,
}: {
  annotationEntries: readonly StoredAnnotation[];
  configuredReferenceAnnotationId: string | null;
}): string | null => {
  const pointMeasurements = annotationEntries.filter(
    (annotationEntry) => annotationEntry.toolType === ANNOTATION_TYPE_POINT
  );

  if (
    configuredReferenceAnnotationId &&
    pointMeasurements.some(
      (annotationEntry) =>
        annotationEntry.id === configuredReferenceAnnotationId
    )
  ) {
    return configuredReferenceAnnotationId;
  }

  return pointMeasurements[0]?.id ?? null;
};

export const resolvePointElevationReferenceCoordinate = ({
  annotationEntries,
  nodes,
  configuredReferenceAnnotationId,
}: {
  annotationEntries: readonly StoredAnnotation[];
  nodes: readonly AnnotationNode[];
  configuredReferenceAnnotationId: string | null;
}): CesiumGeographicCoordinate | null => {
  const referenceAnnotationId = resolvePointElevationReferenceAnnotationId({
    annotationEntries,
    configuredReferenceAnnotationId,
  });
  if (!referenceAnnotationId) {
    return null;
  }

  const referenceMeasurement =
    annotationEntries.find(
      (annotationEntry) => annotationEntry.id === referenceAnnotationId
    ) ?? null;
  const referenceNodeId = referenceMeasurement?.nodeIds[0] ?? null;

  return nodes.find((node) => node.id === referenceNodeId)?.coordinate ?? null;
};

export const resolvePointRelativeElevationMeters = ({
  coordinate,
  referenceCoordinate,
}: {
  coordinate: CesiumGeographicCoordinate;
  referenceCoordinate: CesiumGeographicCoordinate | null;
}): number | null =>
  referenceCoordinate
    ? coordinate.altitude - referenceCoordinate.altitude
    : null;

export const formatPointElevationLabelText = ({
  coordinate,
  referenceCoordinate,
  elevationDisplayMode,
  formatOptions,
  labels = defaultPointElevationTextLabels,
}: {
  coordinate: CesiumGeographicCoordinate;
  referenceCoordinate: CesiumGeographicCoordinate | null;
  elevationDisplayMode: AnnotationElevationDisplayMode;
  formatOptions: AnnotationsRuntimeFormatOptions;
  labels?: PointElevationTextLabels;
}): string => {
  if (
    elevationDisplayMode === ANNOTATION_ELEVATION_DISPLAY_MODES.ABSOLUTE ||
    !referenceCoordinate
  ) {
    return `${labels.absolutePrefix} ${formatLengthMeters(
      coordinate.altitude,
      formatOptions.lengthMeters
    )}`;
  }

  const relativeElevationMeters =
    coordinate.altitude - referenceCoordinate.altitude;
  const elevationText = formatLengthMeters(
    relativeElevationMeters,
    formatOptions.lengthMeters
  );
  if (
    Math.abs(relativeElevationMeters) <
    pointElevationDisplayDefaults.neutralThresholdMeters
  ) {
    return elevationText;
  }

  return `${elevationText} ${
    relativeElevationMeters > 0
      ? pointElevationDisplayDefaults.glyphs.up
      : pointElevationDisplayDefaults.glyphs.down
  }`;
};

export const formatPointRelativeHeightInfoText = ({
  coordinate,
  referenceCoordinate,
  formatOptions,
  labels = defaultPointElevationTextLabels,
}: {
  coordinate: CesiumGeographicCoordinate;
  referenceCoordinate: CesiumGeographicCoordinate | null;
  formatOptions: AnnotationsRuntimeFormatOptions;
  labels?: PointElevationTextLabels;
}): string =>
  referenceCoordinate
    ? `${formatLengthMeters(
        coordinate.altitude - referenceCoordinate.altitude,
        formatOptions.lengthMeters
      )} ${labels.relativeHeightSuffix}`
    : labels.missingReference;
