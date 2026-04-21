import {
  formatAreaSquareMetersAdaptive,
  formatDegrees,
  formatLengthMeters,
} from "@carma-units";
import type { PolygonType } from "@carma-mapping/annotations/core";
import {
  buildAnnotationMeasurementInfoBoxSlots,
} from "@carma-mapping/annotations/ui";

import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotation-info-box.types";
import { resolveRuntimeMeasurementNavigation } from "../../components/annotation-info-box/runtime-measurement-navigation";
import {
  resolveAreaMeasurementSummary,
} from "../../derived/measurement-summaries";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "../../render/resolve-measurement-coordinates";

export const createNodeChainAreaToolInfoBoxSlots = (
  toolType: PolygonType,
  {
    headingTitle,
    headingColor,
    formatMeasurementLabelToken,
    formatBearing = (bearingDeg, formatOptions) =>
      formatDegrees(bearingDeg, formatOptions.degrees),
  }: {
    headingTitle: string;
    headingColor: string;
    formatMeasurementLabelToken: (counter: number) => string;
    formatBearing?: (
      bearingDeg: number,
      formatOptions: RuntimeAnnotationInfoBoxContext["formatOptions"]
    ) => string;
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
    const summary = resolveAreaMeasurementSummary({
      measurement: annotation,
      toolType,
      coordinates,
    });
    const areaText = formatAreaSquareMetersAdaptive(
      summary.areaSquareMeters,
      formatOptions.areaSquareMeters
    );
    const shortLabelToken = formatMeasurementLabelToken(measurementOrder);
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
          removeAnnotationById(annotation.id);
        },
        dataTestIdPrefix: "carma-annotation-area-measurement",
        dataTestIds: {
          flyTo: "carma-annotation-flyto-area-measurement-btn",
          export: "carma-annotation-export-area-measurement-geojson-btn",
          visibility: "carma-annotation-toggle-area-measurement-visibility-btn",
          lock: "carma-annotation-toggle-area-measurement-lock-btn",
          delete: "carma-annotation-delete-area-measurement-btn",
        },
      },
      metaText: areaText,
      content: (
        <>
          <div>{`Umfang: ${formatLengthMeters(
            summary.perimeterMeters,
            formatOptions.lengthMeters
          )}`}</div>
          {Number.isFinite(summary.verticalityDeg) ? (
            <div>{`Vertikalität: ${formatDegrees(
              summary.verticalityDeg ?? 0,
              formatOptions.degrees
            )}`}</div>
          ) : null}
          {Number.isFinite(summary.bearingDeg) ? (
            <div>{`Ausrichtung: ${formatBearing(
              summary.bearingDeg ?? 0,
              formatOptions
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
      },
      visualOptions: infoBoxVisualOptions,
    });
  };
};
