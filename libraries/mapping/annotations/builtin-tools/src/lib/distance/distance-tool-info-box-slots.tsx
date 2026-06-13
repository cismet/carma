import { Cartesian3 } from "@carma-cesium";
import { cartesian3FromGeographicCoordinate } from "@carma-mapping/engines/cesium/core";
import { CarmaTransforms } from "@carma-mapping/engines/cesium/core";
import { formatLengthMeters } from "@carma-units";
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
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "@carma-mapping/annotations/runtime";

export const createDistanceToolInfoBoxSlots = (
  toolType: RuntimeAnnotationInfoBoxContext["annotation"]["toolType"],
  {
    headingTitle,
    headingColor,
    formatLabelToken,
    actionLabels,
    navigationLabels,
    metricLabels,
  }: {
    headingTitle: string;
    headingColor: string;
    formatLabelToken: (counter: number) => string;
    actionLabels?: Partial<AnnotationInfoBoxActionLabels>;
    navigationLabels?: Partial<AnnotationInfoBoxNavigationLabels>;
    metricLabels: {
      direct: string;
      horizontal: string;
      vertical: string;
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

    const distanceAnnotations = annotationEntries.filter(
      (annotationEntry) => annotationEntry.toolType === toolType
    );
    const distanceOrder =
      distanceAnnotations.findIndex(
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

    if (coordinates.length < 2) {
      return null;
    }

    const startPoint = cartesian3FromGeographicCoordinate(coordinates[0]!);
    const endPoint = cartesian3FromGeographicCoordinate(
      coordinates[coordinates.length - 1]!
    );
    const enuOffset = CarmaTransforms.getEastNorthUpOffset(
      startPoint,
      endPoint
    );
    const directDistanceMeters = Cartesian3.distance(startPoint, endPoint);
    const horizontalDistanceMeters = Math.hypot(
      enuOffset.east,
      enuOffset.north
    );
    const verticalDistanceMeters = Math.abs(enuOffset.up);
    const shortLabelToken = formatLabelToken(distanceOrder);
    const defaultDisplayName = headingTitle;
    const effectiveShortLabel =
      annotation.shortLabel?.trim() || shortLabelToken;
    const formatDistance = (value: number) =>
      formatLengthMeters(value, formatOptions.lengthMeters);
    const directDistanceText = formatDistance(directDistanceMeters);
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
        dataTestIdPrefix: "carma-annotation-distance-annotation",
        dataTestIds: {
          flyTo: "carma-annotation-flyto-distance-annotation-btn",
          export: "carma-annotation-export-distance-annotation-geojson-btn",
          visibility:
            "carma-annotation-toggle-distance-annotation-visibility-btn",
          lock: "carma-annotation-toggle-distance-annotation-lock-btn",
          delete: "carma-annotation-delete-distance-annotation-btn",
        },
      },
      metaText: directDistanceText,
      content: (
        <AnnotationInfoBoxMetricGrid
          items={[
            {
              id: "direct",
              label: metricLabels.direct,
              value: formatDistance(directDistanceMeters),
            },
            {
              id: "horizontal",
              label: metricLabels.horizontal,
              value: formatDistance(horizontalDistanceMeters),
            },
            {
              id: "vertical",
              label: metricLabels.vertical,
              value: formatDistance(verticalDistanceMeters),
            },
          ]}
          visualOptions={infoBoxVisualOptions}
        />
      ),
      contentStyle: {
        paddingBottom: 0,
      },
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
