import {
  formatAreaSquareMetersAdaptive,
  formatDegrees,
  formatLengthMeters,
  radToDegNumeric,
} from "@carma-units";
import type { PolygonType } from "@carma-mapping/annotations/core";
import {
  AnnotationInfoBoxMetricGrid,
  buildAnnotationInfoBoxSlots,
  type AnnotationInfoBoxActionLabels,
  type AnnotationInfoBoxNavigationLabels,
} from "@carma-mapping/annotations/ui";

import type { RuntimeAnnotationInfoBoxContext } from "@carma-mapping/annotations/runtime";
import {
  ANNOTATION_DELETE_CONFIRMATION_SOURCES,
  resolveRuntimeAnnotationNavigation,
} from "@carma-mapping/annotations/runtime";
import { resolveAreaMeasurementSummary } from "../utils/measurement-summaries";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "@carma-mapping/annotations/runtime";

export const createNodeChainAreaToolInfoBoxSlots = (
  toolType: PolygonType,
  {
    headingTitle,
    headingColor,
    formatLabelToken,
    actionLabels,
    navigationLabels,
    metricLabels,
    formatBearing = (bearingRad, formatOptions) =>
      formatDegrees(radToDegNumeric(bearingRad), formatOptions.degrees),
  }: {
    headingTitle: string;
    headingColor: string;
    formatLabelToken: (counter: number) => string;
    actionLabels?: Partial<AnnotationInfoBoxActionLabels>;
    navigationLabels?: Partial<AnnotationInfoBoxNavigationLabels>;
    metricLabels: {
      perimeter: string;
      verticality: string;
      bearing: string;
    };
    formatBearing?: (
      bearingRad: number,
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

    const annotations = annotationEntries.filter(
      (annotationEntry) => annotationEntry.toolType === toolType
    );
    const annotationOrder =
      annotations.findIndex(
        (annotationEntry) => annotationEntry.id === annotation.id
      ) + 1;
    const coordinates = resolveMeasurementCoordinates(
      annotation,
      buildRuntimeNodeCoordinateMap(nodes)
    );
    const navigation = resolveRuntimeAnnotationNavigation({
      annotationEntries,
      selectedAnnotationId: annotation.id,
      focusAnnotationId,
      flyToAllAnnotations,
    });
    const summary = resolveAreaMeasurementSummary({
      annotation,
      toolType,
      coordinates,
    });
    const areaText = formatAreaSquareMetersAdaptive(
      summary.areaSquareMeters,
      formatOptions.areaSquareMeters
    );
    const shortLabelToken = formatLabelToken(annotationOrder);
    const defaultDisplayName = headingTitle;
    const effectiveShortLabel =
      annotation.shortLabel?.trim() || shortLabelToken;
    return buildAnnotationInfoBoxSlots({
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
        dataTestIdPrefix: "carma-annotation-area-annotation",
        dataTestIds: {
          flyTo: "carma-annotation-flyto-area-annotation-btn",
          export: "carma-annotation-export-area-annotation-geojson-btn",
          visibility: "carma-annotation-toggle-area-annotation-visibility-btn",
          lock: "carma-annotation-toggle-area-annotation-lock-btn",
          delete: "carma-annotation-delete-area-annotation-btn",
        },
      },
      metaText: areaText,
      content: (
        <AnnotationInfoBoxMetricGrid
          items={[
            {
              id: "perimeter",
              label: metricLabels.perimeter,
              value: formatLengthMeters(
                summary.perimeterMeters,
                formatOptions.lengthMeters
              ),
            },
            ...(Number.isFinite(summary.verticalityDeg)
              ? [
                  {
                    id: "verticality",
                    label: metricLabels.verticality,
                    value: formatDegrees(
                      summary.verticalityDeg ?? 0,
                      formatOptions.degrees
                    ),
                  },
                ]
              : []),
            ...(Number.isFinite(summary.bearingRad)
              ? [
                  {
                    id: "bearing",
                    label: metricLabels.bearing,
                    value: formatBearing(
                      summary.bearingRad ?? 0,
                      formatOptions
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
        onFlyToAll: navigation?.flyToAllAnnotations,
        onPrevious: () => navigation?.selectRelativeAnnotation(-1),
        onNext: () => navigation?.selectRelativeAnnotation(1),
        labels: navigationLabels,
      },
      visualOptions: infoBoxVisualOptions,
    });
  };
};
