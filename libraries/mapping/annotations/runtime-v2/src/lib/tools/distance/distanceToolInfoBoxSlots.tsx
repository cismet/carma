import { Cartesian3 } from "@carma-cesium";
import { cartesian3FromGeographicCoordinate } from "@carma-mapping/engines/cesium/core";
import { CarmaTransforms } from "@carma-mapping/engines/cesium/core";
import { formatLengthMeters } from "@carma-units";

import { RuntimeAnnotationInfoBoxActions } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxActions";
import { RuntimeAnnotationInfoBoxNavigation } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxNavigation";
import { RuntimeAnnotationInfoBoxTitleInput } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxTitleInput";
import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotationInfoBox.types";
import { resolveRuntimeMeasurementNavigation } from "../../components/annotation-info-box/runtimeMeasurementNavigation";
import { resolveMeasurementCoordinates } from "../../render/resolveMeasurementCoordinates";

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
      new Map(nodes.map((node) => [node.id, node.coordinate]))
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
    const shortLabelToken = formatMeasurementLabelToken(distanceOrder);
    const defaultDisplayName = headingTitle;
    const effectiveShortLabel =
      annotation.shortLabel?.trim() || shortLabelToken;
    const formatDistance = (value: number) =>
      formatLengthMeters(value, formatOptions.lengthMeters);
    const directDistanceText = formatDistance(directDistanceMeters);
    const actionIcons = (
      <RuntimeAnnotationInfoBoxActions
        hidden={annotation.hidden}
        locked={annotation.locked}
        onFlyTo={(event) => {
          event.stopPropagation();
          focusAnnotationId(annotation.id);
        }}
        onExport={(event) => {
          event.stopPropagation();
          exportAnnotationGeoJson(annotation.id);
        }}
        onToggleVisibility={(event) => {
          event.stopPropagation();
          toggleAnnotationVisibility(annotation.id);
        }}
        onToggleLock={(event) => {
          event.stopPropagation();
          toggleAnnotationLocked(annotation.id);
        }}
        onDelete={(event) => {
          event.stopPropagation();
          removeAnnotationById(annotation.id);
        }}
        visualOptions={infoBoxVisualOptions}
        dataTestIdPrefix="carma-v2-distance-measurement"
        dataTestIds={{
          flyTo: "carma-v2-flyto-distance-measurement-btn",
          export: "carma-v2-export-distance-measurement-geojson-btn",
          visibility: "carma-v2-toggle-distance-measurement-visibility-btn",
          lock: "carma-v2-toggle-distance-measurement-lock-btn",
          delete: "carma-v2-delete-distance-measurement-btn",
        }}
      />
    );

    return {
      headingTitle,
      headingColor,
      actions: actionIcons,
      subtitle: (
        <div className={infoBoxVisualOptions.subtitleContainerClassName}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <RuntimeAnnotationInfoBoxTitleInput
                value={annotation.displayName ?? ""}
                placeholder={defaultDisplayName}
                onCommit={(nextValue) =>
                  updateAnnotationDisplayName(annotation.id, nextValue)
                }
                shortLabelValue={annotation.shortLabel ?? ""}
                shortLabelPlaceholder={effectiveShortLabel}
                onShortLabelCommit={(nextValue) =>
                  updateAnnotationShortLabel(annotation.id, nextValue)
                }
                visualOptions={infoBoxVisualOptions}
              />
            </div>
            <div className="shrink-0">{actionIcons}</div>
          </div>
          <div className={infoBoxVisualOptions.subtitleMetaTextClassName}>
            {directDistanceText}
          </div>
        </div>
      ),
      content: (
        <div
          className={`${infoBoxVisualOptions.bodyContainerClassName} ${infoBoxVisualOptions.bodyTextClassName}`}
        >
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
          </div>
        </div>
      ),
      footer: (
        <RuntimeAnnotationInfoBoxNavigation
          totalEntries={navigation?.totalEntries ?? 0}
          currentIndex={navigation?.currentIndex ?? 0}
          onFlyToAllMeasurements={navigation?.flyToAllMeasurements}
          onPreviousMeasurement={() =>
            navigation?.selectRelativeMeasurement(-1)
          }
          onNextMeasurement={() => navigation?.selectRelativeMeasurement(1)}
          visualOptions={infoBoxVisualOptions}
        />
      ),
      collapsible: true,
    };
  };
};
