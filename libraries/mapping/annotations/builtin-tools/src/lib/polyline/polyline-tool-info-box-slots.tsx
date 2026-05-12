import {
  formatDegrees,
  formatLengthMeters,
  radToDegNumeric,
} from "@carma-units";
import {
  AnnotationInfoBoxMetricGrid,
  buildAnnotationMeasurementInfoBoxSlots,
  type AnnotationInfoBoxActionLabels,
  type AnnotationInfoBoxNavigationLabels,
} from "@carma-mapping/annotations/ui";

import type { RuntimeAnnotationInfoBoxContext } from "@carma-mapping/annotations/runtime";
import { resolveRuntimeMeasurementNavigation } from "@carma-mapping/annotations/runtime";
import { resolvePolylineMeasurementSummary } from "../utils/measurement-summaries";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "@carma-mapping/annotations/runtime";

export const createPolylineToolInfoBoxSlots = (
  toolType: RuntimeAnnotationInfoBoxContext["annotation"]["toolType"],
  {
    headingTitle,
    headingColor,
    formatMeasurementLabelToken,
    actionLabels,
    navigationLabels,
    metricLabels,
  }: {
    headingTitle: string;
    headingColor: string;
    formatMeasurementLabelToken: (counter: number) => string;
    actionLabels?: Partial<AnnotationInfoBoxActionLabels>;
    navigationLabels?: Partial<AnnotationInfoBoxNavigationLabels>;
    metricLabels: {
      totalLength: string;
      segmentCount: string;
      meanSegmentLength: string;
      ascent: string;
      descent: string;
      absoluteElevationChange: string;
      startEndElevationDelta: string;
      bearing: string;
    };
  }
) => {
  return ({
    annotation,
    annotationEntries,
    formatOptions,
    flyToAllAnnotations,
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

    const polylineMeasurements = annotationEntries.filter(
      (measurementEntry) => measurementEntry.toolType === toolType
    );
    const polylineOrder =
      polylineMeasurements.findIndex(
        (measurementEntry) => measurementEntry.id === annotation.id
      ) + 1;
    const coordinates = resolveMeasurementCoordinates(
      annotation,
      buildRuntimeNodeCoordinateMap(nodes)
    );
    const navigation = resolveRuntimeMeasurementNavigation({
      annotationEntries,
      selectedAnnotationId: annotation.id,
      focusAnnotationId,
      flyToAllAnnotations,
    });
    const summary = resolvePolylineMeasurementSummary(coordinates);
    const bearingRad = summary?.bearingRad ?? null;

    if (!summary) {
      return null;
    }

    const shortLabelToken = formatMeasurementLabelToken(polylineOrder);
    const defaultDisplayName = headingTitle;
    const effectiveShortLabel =
      annotation.shortLabel?.trim() || shortLabelToken;
    const formatDistance = (value: number) =>
      formatLengthMeters(value, formatOptions.lengthMeters);
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
          removeAnnotationById(annotation.id);
        },
        labels: actionLabels,
        dataTestIdPrefix: "carma-annotation-polyline-measurement",
        dataTestIds: {
          flyTo: "carma-annotation-flyto-polyline-measurement-btn",
          export: "carma-annotation-export-polyline-measurement-geojson-btn",
          visibility:
            "carma-annotation-toggle-polyline-measurement-visibility-btn",
          lock: "carma-annotation-toggle-polyline-measurement-lock-btn",
          delete: "carma-annotation-delete-polyline-measurement-btn",
        },
      },
      metaText: formatDistance(summary.totalLengthMeters),
      content: (
        <AnnotationInfoBoxMetricGrid
          items={[
            {
              id: "total-length",
              label: metricLabels.totalLength,
              value: formatDistance(summary.totalLengthMeters),
            },
            {
              id: "segment-count",
              label: metricLabels.segmentCount,
              value: summary.segmentCount,
            },
            {
              id: "mean-segment-length",
              label: metricLabels.meanSegmentLength,
              value: formatDistance(summary.meanSegmentLengthMeters),
            },
            {
              id: "ascent",
              label: metricLabels.ascent,
              value: formatDistance(summary.ascentMeters),
            },
            {
              id: "descent",
              label: metricLabels.descent,
              value: formatDistance(summary.descentMeters),
            },
            {
              id: "absolute-elevation-change",
              label: metricLabels.absoluteElevationChange,
              value: formatDistance(summary.totalAbsoluteElevationChangeMeters),
            },
            {
              id: "start-end-elevation-delta",
              label: metricLabels.startEndElevationDelta,
              value: formatDistance(summary.startEndElevationDeltaMeters),
            },
            ...(Number.isFinite(bearingRad)
              ? [
                  {
                    id: "bearing",
                    label: metricLabels.bearing,
                    value: formatDegrees(
                      radToDegNumeric(bearingRad ?? 0),
                      formatOptions.degrees
                    ),
                  },
                ]
              : []),
          ]}
          visualOptions={infoBoxVisualOptions}
        />
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
