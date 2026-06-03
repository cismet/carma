import { formatAreaSquareMetersAdaptive } from "@carma-units";
import type { PolygonType } from "@carma-mapping/annotations/core";
import {
  buildAnnotationMeasurementInfoBoxSlots,
  type AnnotationInfoBoxActionLabels,
  type AnnotationInfoBoxNavigationLabels,
} from "@carma-mapping/annotations/ui";

import type { RuntimeAnnotationInfoBoxContext } from "@carma-mapping/annotations/runtime";
import {
  ANNOTATION_DELETE_CONFIRMATION_SOURCES,
  resolveRuntimeMeasurementNavigation,
} from "@carma-mapping/annotations/runtime";
import { resolveAreaMeasurementSummary } from "../utils/measurement-summaries";
import { formatCardinalBearing } from "@carma-mapping/annotations/runtime";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "@carma-mapping/annotations/runtime";

export const createVerticalAreaToolInfoBoxSlots = (
  toolType: PolygonType,
  {
    headingTitle,
    headingColor,
    formatMeasurementLabelToken,
    actionLabels,
    navigationLabels,
    contentLabels,
  }: {
    headingTitle: string;
    headingColor: string;
    formatMeasurementLabelToken: (counter: number) => string;
    actionLabels?: Partial<AnnotationInfoBoxActionLabels>;
    navigationLabels?: Partial<AnnotationInfoBoxNavigationLabels>;
    contentLabels: {
      bearingPrefix: string;
    };
  }
) => {
  return ({
    annotation,
    annotationEntries,
    flyToAllAnnotations,
    formatOptions,
    focusAnnotationId,
    nodes,
    removeAnnotationById,
    exportAnnotationGeoJson,
    toggleAnnotationVisibility,
    toggleAnnotationLocked,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
    infoBoxVisualOptions,
  }: RuntimeAnnotationInfoBoxContext) => {
    if (annotation.toolType !== toolType) {
      return null;
    }

    const measurements = annotationEntries.filter(
      (measurementEntry) => measurementEntry.toolType === toolType
    );
    const measurementOrder =
      measurements.findIndex(
        (measurementEntry) => measurementEntry.id === annotation.id
      ) + 1;
    const shortLabelToken = formatMeasurementLabelToken(measurementOrder);
    const navigation = resolveRuntimeMeasurementNavigation({
      annotationEntries,
      selectedAnnotationId: annotation.id,
      focusAnnotationId,
      flyToAllAnnotations,
    });
    const coordinates = resolveMeasurementCoordinates(
      annotation,
      buildRuntimeNodeCoordinateMap(nodes)
    );
    const summary = resolveAreaMeasurementSummary({
      measurement: annotation,
      toolType,
      coordinates,
    });
    const areaText = formatAreaSquareMetersAdaptive(
      summary.areaSquareMeters,
      formatOptions.areaSquareMeters
    );
    const defaultDisplayName = headingTitle;
    const effectiveShortLabel =
      annotation.shortLabel?.trim() || shortLabelToken;
    return buildAnnotationMeasurementInfoBoxSlots({
      headingTitle,
      headingColor,
      titleInput: {
        value: annotation.displayName ?? "",
        placeholder: defaultDisplayName,
        onCommit: (nextValue) =>
          updateAnnotationDisplayName(annotation.id, nextValue),
        shortLabelValue: annotation.shortLabel ?? "",
        shortLabelPlaceholder: effectiveShortLabel,
        onShortLabelCommit: (nextValue) =>
          updateAnnotationShortLabel(annotation.id, nextValue),
      },
      actions: {
        hidden: annotation.hidden,
        locked: annotation.locked,
        onFlyTo: (event) => {
          event.stopPropagation();
          focusAnnotationId(annotation.id);
        },
        onExport: (event) => {
          event.stopPropagation();
          exportAnnotationGeoJson(annotation.id);
        },
        onToggleVisibility: (event) => {
          event.stopPropagation();
          toggleAnnotationVisibility(annotation.id);
        },
        onToggleLock: (event) => {
          event.stopPropagation();
          toggleAnnotationLocked(annotation.id);
        },
        onDelete: (event) => {
          event.stopPropagation();
          removeAnnotationById(annotation.id, {
            skipConfirmation: event.shiftKey,
            source: ANNOTATION_DELETE_CONFIRMATION_SOURCES.UI,
          });
        },
        labels: actionLabels,
        dataTestIdPrefix: "carma-annotation-vertical-area-measurement",
        dataTestIds: {
          flyTo: "carma-annotation-flyto-vertical-area-measurement-btn",
          export:
            "carma-annotation-export-vertical-area-measurement-geojson-btn",
          visibility:
            "carma-annotation-toggle-vertical-area-measurement-visibility-btn",
          lock: "carma-annotation-toggle-vertical-area-measurement-lock-btn",
          delete: "carma-annotation-delete-vertical-area-measurement-btn",
        },
      },
      metaText: areaText,
      content: (
        <>
          {Number.isFinite(summary.bearingRad) ? (
            <div>{`${contentLabels.bearingPrefix}: ${formatCardinalBearing(
              summary.bearingRad ?? 0
            )}`}</div>
          ) : null}
        </>
      ),
      navigation: {
        totalEntries: navigation?.totalEntries ?? 0,
        currentIndex: navigation?.currentIndex ?? 0,
        onFlyToAllMeasurements: navigation?.flyToAllMeasurements,
        onPreviousMeasurement: () => navigation?.selectRelativeMeasurement(-1),
        onNextMeasurement: () => navigation?.selectRelativeMeasurement(1),
        labels: navigationLabels,
      },
      visualOptions: infoBoxVisualOptions,
    });
  };
};
