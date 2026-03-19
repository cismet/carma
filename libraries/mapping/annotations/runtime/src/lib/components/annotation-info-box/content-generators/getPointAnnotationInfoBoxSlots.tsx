import {
  isPointMeasurementEntry,
  type PointMeasurementEntry,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationSlots,
  AnnotationInfoBoxEntryPayload,
} from "../annotationInfoBoxSlots.types";
import {
  getInfoBoxPointDefaultName,
  POINT_MODE_INSTRUCTION,
  POINT_TITLE,
  renderEditableAnnotationSubtitle,
  renderRelativeElevationContent,
} from "./shared";
import {
  isPointReferenceMeasurement,
  resolvePointAnnotationDisplayPoint,
  resolvePointRelativeElevation,
} from "../utils/pointAnnotationDisplay";

export const getPointAnnotationInfoBoxSlots = (
  input: AnnotationInfoBoxEntryPayload
): AnnotationSlots => {
  const measurement = input.kind === "point" ? input.pointAnnotation : null;
  const pointMeasurements = input.pointEntries.filter(
    (entry): entry is PointMeasurementEntry =>
      isPointMeasurementEntry(entry) && !entry.auxiliaryLabelAnchor
  );
  const currentOrder =
    measurement && isPointMeasurementEntry(measurement)
      ? pointMeasurements.findIndex((entry) => entry.id === measurement.id) + 1
      : null;
  const nextOrder = pointMeasurements.length + 1;
  const displayPoint = resolvePointAnnotationDisplayPoint(measurement);
  const isReference = isPointReferenceMeasurement(
    measurement,
    input.referencePoint
  );
  const relativeElevation = resolvePointRelativeElevation(
    displayPoint,
    input.referencePoint
  );

  return {
    headingTitle: POINT_TITLE,
    subtitle: renderEditableAnnotationSubtitle({
      defaultDisplayName: getInfoBoxPointDefaultName({
        currentOrder,
        nextOrder,
      }),
      measurement,
      displayPoint,
      isReference,
      actions: input.actions,
    }),
    content: renderRelativeElevationContent(relativeElevation),
    collapsible: Boolean(measurement),
    instructionText: measurement ? null : POINT_MODE_INSTRUCTION,
  };
};
