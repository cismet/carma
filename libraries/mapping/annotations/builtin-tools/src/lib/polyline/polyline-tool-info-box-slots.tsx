import {
  formatDegrees,
  formatLengthMeters,
  radToDegNumeric,
} from "@carma-units";
import { buildAnnotationMeasurementInfoBoxSlots } from "@carma-mapping/annotations/ui";

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
  }: {
    headingTitle: string;
    headingColor: string;
    formatMeasurementLabelToken: (counter: number) => string;
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
        <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 tabular-nums">
          <span className={infoBoxVisualOptions.mutedTextClassName}>
            Gesamtlänge
          </span>
          <span>{formatDistance(summary.totalLengthMeters)}</span>
          <span className={infoBoxVisualOptions.mutedTextClassName}>
            Segmente
          </span>
          <span>{summary.segmentCount}</span>
          <span className={infoBoxVisualOptions.mutedTextClassName}>
            Ø Segment
          </span>
          <span>{formatDistance(summary.meanSegmentLengthMeters)}</span>
          <span className={infoBoxVisualOptions.mutedTextClassName}>
            Aufstieg
          </span>
          <span>{formatDistance(summary.ascentMeters)}</span>
          <span className={infoBoxVisualOptions.mutedTextClassName}>
            Abstieg
          </span>
          <span>{formatDistance(summary.descentMeters)}</span>
          <span className={infoBoxVisualOptions.mutedTextClassName}>
            Summe H
          </span>
          <span>
            {formatDistance(summary.totalAbsoluteElevationChangeMeters)}
          </span>
          <span className={infoBoxVisualOptions.mutedTextClassName}>
            Δ Start/Ende
          </span>
          <span>{formatDistance(summary.startEndElevationDeltaMeters)}</span>
          {Number.isFinite(bearingRad) ? (
            <>
              <span className={infoBoxVisualOptions.mutedTextClassName}>
                Ausrichtung
              </span>
              <span>
                {formatDegrees(
                  radToDegNumeric(bearingRad ?? 0),
                  formatOptions.degrees
                )}
              </span>
            </>
          ) : null}
        </div>
      ),
      navigation: {
        totalEntries: navigation?.totalEntries ?? 0,
        currentIndex: navigation?.currentIndex ?? 0,
        onFlyToAllMeasurements: navigation?.flyToAllMeasurements,
        onPreviousMeasurement: () => navigation?.selectRelativeMeasurement(-1),
        onNextMeasurement: () => navigation?.selectRelativeMeasurement(1),
      },
      visualOptions: infoBoxVisualOptions,
    });
  };
};
