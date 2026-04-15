import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import { formatLengthMeters } from "@carma-units";
import type { AnnotationsRuntimeFormatOptions } from "../../config/annotations-runtime-format-options";
import {
  RUNTIME_ELEVATION_DISPLAY_MODE,
  type RuntimeAnnotationEntry,
  type RuntimeCoordinate,
  type RuntimeElevationDisplayMode,
  type RuntimeNode,
} from "../../store/annotations-store.types";
const { POINT: ANNOTATION_TYPE_POINT } = ANNOTATION_TYPES;

const pointElevationDisplayDefaults = Object.freeze({
  neutralThresholdMeters: 0.03,
  glyphs: Object.freeze({
    up: "↥",
    down: "↧",
  }),
});

export const resolvePointElevationDisplayMode = (
  annotation: RuntimeAnnotationEntry
): RuntimeElevationDisplayMode =>
  annotation.elevationDisplayMode ?? RUNTIME_ELEVATION_DISPLAY_MODE.RELATIVE;

export const resolvePointElevationReferenceAnnotationId = ({
  annotationEntries,
  configuredReferenceAnnotationId,
}: {
  annotationEntries: readonly RuntimeAnnotationEntry[];
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
  annotationEntries: readonly RuntimeAnnotationEntry[];
  nodes: readonly RuntimeNode[];
  configuredReferenceAnnotationId: string | null;
}): RuntimeCoordinate | null => {
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
  coordinate: RuntimeCoordinate;
  referenceCoordinate: RuntimeCoordinate | null;
}): number | null =>
  referenceCoordinate
    ? coordinate.altitude - referenceCoordinate.altitude
    : null;

export const formatPointElevationLabelText = ({
  coordinate,
  referenceCoordinate,
  elevationDisplayMode,
  formatOptions,
}: {
  coordinate: RuntimeCoordinate;
  referenceCoordinate: RuntimeCoordinate | null;
  elevationDisplayMode: RuntimeElevationDisplayMode;
  formatOptions: AnnotationsRuntimeFormatOptions;
}): string => {
  if (
    elevationDisplayMode === RUNTIME_ELEVATION_DISPLAY_MODE.ABSOLUTE ||
    !referenceCoordinate
  ) {
    return `NHN ${formatLengthMeters(
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
}: {
  coordinate: RuntimeCoordinate;
  referenceCoordinate: RuntimeCoordinate | null;
  formatOptions: AnnotationsRuntimeFormatOptions;
}): string =>
  referenceCoordinate
    ? `${formatLengthMeters(
        coordinate.altitude - referenceCoordinate.altitude,
        formatOptions.lengthMeters
      )} relative Höhe über Bezugspunkt`
    : "Keine Referenzhöhe gesetzt.";
