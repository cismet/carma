import { formatLatLonDegrees, formatLengthMeters } from "@carma-units";
import type { Degrees } from "@carma-units";
import { buildAnnotationInfoBoxSlots } from "@carma-mapping/annotations/ui";

import type { RuntimeAnnotationInfoBoxContext } from "@carma-mapping/annotations/runtime";
import {
  ANNOTATION_DELETE_CONFIRMATION_SOURCES,
  resolveRuntimeAnnotationNavigation,
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
    formatLabelToken,
    actionLabels,
    navigationLabels,
    elevationLabels,
  }: {
    headingTitle: string;
    headingColor: string;
    formatLabelToken: (counter: number) => string;
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

    const pointAnnotations = annotationEntries.filter(
      (annotationEntry) => annotationEntry.toolType === toolType
    );
    const pointOrder =
      pointAnnotations.findIndex(
        (annotationEntry) => annotationEntry.id === annotation.id
      ) + 1;
    const coordinate =
      resolveMeasurementCoordinates(
        annotation,
        buildRuntimeNodeCoordinateMap(nodes)
      )[0] ?? null;
    const navigation = resolveRuntimeAnnotationNavigation({
      annotationEntries,
      selectedAnnotationId: annotation.id,
      focusAnnotationId,
      flyToAllAnnotations,
    });

    if (!coordinate) {
      return null;
    }

    const shortLabelToken = formatLabelToken(pointOrder);
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
    const isReferenceAnnotation = referenceAnnotationId === annotation.id;
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
        onSetReference: isReferenceAnnotation
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
        dataTestIdPrefix: "carma-annotation-point-annotation",
        dataTestIds: {
          flyTo: "carma-annotation-flyto-point-annotation-btn",
          export: "carma-annotation-export-point-annotation-geojson-btn",
          visibility: "carma-annotation-toggle-point-annotation-visibility-btn",
          reference: "carma-annotation-set-reference-point-annotation-btn",
          lock: "carma-annotation-toggle-point-annotation-lock-btn",
          delete: "carma-annotation-delete-point-annotation-btn",
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
        onFlyToAll: navigation?.flyToAllAnnotations,
        onPrevious: () => navigation?.selectRelativeAnnotation(-1),
        onNext: () => navigation?.selectRelativeAnnotation(1),
        labels: navigationLabels,
      },
      visualOptions: infoBoxVisualOptions,
    });
  };
};
