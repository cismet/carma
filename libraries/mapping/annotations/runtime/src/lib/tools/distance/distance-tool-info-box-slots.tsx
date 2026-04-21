import { Cartesian3 } from "@carma-cesium";
import { cartesian3FromGeographicCoordinate } from "@carma-mapping/engines/cesium/core";
import { CarmaTransforms } from "@carma-mapping/engines/cesium/core";
import { formatLengthMeters } from "@carma-units";
import {
  buildAnnotationMeasurementInfoBoxSlots,
} from "@carma-mapping/annotations/ui";

import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotation-info-box.types";
import { resolveRuntimeMeasurementNavigation } from "../../components/annotation-info-box/runtime-measurement-navigation";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "../../render/resolve-measurement-coordinates";
import {
  formatGermanCardinalBearing,
  resolveBearingDegFromFirstToLastCoordinate,
} from "../../utils/german-cardinal-bearing";

export const createDistanceToolInfoBoxSlots = (
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

    const distanceMeasurements = annotationEntries.filter(
      (measurementEntry) => measurementEntry.toolType === toolType
    );
    const distanceOrder =
      distanceMeasurements.findIndex(
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
    const bearingDeg = resolveBearingDegFromFirstToLastCoordinate(coordinates);
    const shortLabelToken = formatMeasurementLabelToken(distanceOrder);
    const defaultDisplayName = headingTitle;
    const effectiveShortLabel =
      annotation.shortLabel?.trim() || shortLabelToken;
    const formatDistance = (value: number) =>
      formatLengthMeters(value, formatOptions.lengthMeters);
    const directDistanceText = formatDistance(directDistanceMeters);
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
        dataTestIdPrefix: "carma-annotation-distance-measurement",
        dataTestIds: {
          flyTo: "carma-annotation-flyto-distance-measurement-btn",
          export: "carma-annotation-export-distance-measurement-geojson-btn",
          visibility:
            "carma-annotation-toggle-distance-measurement-visibility-btn",
          lock: "carma-annotation-toggle-distance-measurement-lock-btn",
          delete: "carma-annotation-delete-distance-measurement-btn",
        },
      },
      metaText: directDistanceText,
      content: (
        <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 tabular-nums">
          <span className={infoBoxVisualOptions.mutedTextClassName}>
            Direkt
          </span>
          <span>{formatDistance(directDistanceMeters)}</span>
          <span className={infoBoxVisualOptions.mutedTextClassName}>
            Horizontal
          </span>
          <span>{formatDistance(horizontalDistanceMeters)}</span>
          <span className={infoBoxVisualOptions.mutedTextClassName}>
            Vertikal
          </span>
          <span>{formatDistance(verticalDistanceMeters)}</span>
          {Number.isFinite(bearingDeg) ? (
            <>
              <span className={infoBoxVisualOptions.mutedTextClassName}>
                Ausrichtung
              </span>
              <span>{formatGermanCardinalBearing(bearingDeg ?? 0)}</span>
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
