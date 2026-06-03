import { formatLatLonDegrees, formatLengthMeters } from "@carma-units";
import type { Degrees } from "@carma-units";
import { buildAnnotationMeasurementInfoBoxSlots } from "@carma-mapping/annotations/ui";

import type { RuntimeAnnotationInfoBoxContext } from "@carma-mapping/annotations/runtime";
import {
  ANNOTATION_DELETE_CONFIRMATION_SOURCES,
  resolveRuntimeMeasurementNavigation,
} from "@carma-mapping/annotations/runtime";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "@carma-mapping/annotations/runtime";
import {
  formatPointRelativeHeightInfoText,
  type PointElevationTextLabels,
  resolvePointElevationReferenceCoordinate,
  resolvePointElevationReferenceAnnotationId,
} from "./point-tool-elevation-display";
import type {
  AnnotationInfoBoxActionLabels,
  AnnotationInfoBoxNavigationLabels,
} from "@carma-mapping/annotations/ui";

export const createPointToolInfoBoxSlots = (
  toolType: RuntimeAnnotationInfoBoxContext["annotation"]["toolType"],
  {
    headingTitle,
    headingColor,
    formatMeasurementLabelToken,
    actionLabels,
    navigationLabels,
    elevationLabels,
  }: {
    headingTitle: string;
    headingColor: string;
    formatMeasurementLabelToken: (counter: number) => string;
    actionLabels?: Partial<AnnotationInfoBoxActionLabels>;
    navigationLabels?: Partial<AnnotationInfoBoxNavigationLabels>;
    elevationLabels?: PointElevationTextLabels;
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
    elevationReferenceAnnotationId,
    setElevationReferenceAnnotationId,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
    infoBoxVisualOptions,
  }: RuntimeAnnotationInfoBoxContext) => {
    if (annotation.toolType !== toolType) {
      return null;
    }

    const pointMeasurements = annotationEntries.filter(
      (measurementEntry) => measurementEntry.toolType === toolType
    );
    const pointOrder =
      pointMeasurements.findIndex(
        (measurementEntry) => measurementEntry.id === annotation.id
      ) + 1;
    const coordinate =
      resolveMeasurementCoordinates(
        annotation,
        buildRuntimeNodeCoordinateMap(nodes)
      )[0] ?? null;
    const navigation = resolveRuntimeMeasurementNavigation({
      annotationEntries,
      selectedAnnotationId: annotation.id,
      focusAnnotationId,
      flyToAllAnnotations,
    });

    if (!coordinate) {
      return null;
    }

    const shortLabelToken = formatMeasurementLabelToken(pointOrder);
    const defaultDisplayName = headingTitle;
    const effectiveShortLabel =
      annotation.shortLabel?.trim() || shortLabelToken;
    const [latitude, longitude] = formatLatLonDegrees(
      coordinate.latitude as Degrees,
      coordinate.longitude as Degrees,
      formatOptions.geographicCoordinate
    );
    const elevationText = `NHN ${formatLengthMeters(
      coordinate.altitude,
      formatOptions.lengthMeters
    )}`;
    const referenceCoordinate = resolvePointElevationReferenceCoordinate({
      annotationEntries,
      nodes,
      configuredReferenceAnnotationId: elevationReferenceAnnotationId,
    });
    const referenceAnnotationId = resolvePointElevationReferenceAnnotationId({
      annotationEntries,
      configuredReferenceAnnotationId: elevationReferenceAnnotationId,
    });
    const isReferenceMeasurement = referenceAnnotationId === annotation.id;
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
        onSetReference: isReferenceMeasurement
          ? undefined
          : (event) => {
              event.stopPropagation();
              setElevationReferenceAnnotationId(annotation.id);
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
        dataTestIdPrefix: "carma-annotation-point-measurement",
        dataTestIds: {
          flyTo: "carma-annotation-flyto-point-measurement-btn",
          export: "carma-annotation-export-point-measurement-geojson-btn",
          visibility:
            "carma-annotation-toggle-point-measurement-visibility-btn",
          reference: "carma-annotation-set-reference-point-measurement-btn",
          lock: "carma-annotation-toggle-point-measurement-lock-btn",
          delete: "carma-annotation-delete-point-measurement-btn",
        },
      },
      metaText: `${latitude} ${longitude} • ${elevationText}`,
      content: (
        <div>
          {formatPointRelativeHeightInfoText({
            coordinate,
            referenceCoordinate,
            formatOptions,
            labels: elevationLabels,
          })}
        </div>
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
