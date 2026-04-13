import { formatLatLonDegrees, formatLengthMeters } from "@carma-units";
import type { Degrees } from "@carma-units";

import { RuntimeAnnotationInfoBoxActions } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxActions";
import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotationInfoBox.types";
import { RuntimeAnnotationInfoBoxNavigation } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxNavigation";
import { RuntimeAnnotationInfoBoxTitleInput } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxTitleInput";
import { resolveRuntimeMeasurementNavigation } from "../../components/annotation-info-box/runtimeMeasurementNavigation";
import { resolveMeasurementCoordinates } from "../../render/resolveMeasurementCoordinates";
import {
  formatPointRelativeHeightInfoText,
  resolvePointElevationReferenceCoordinate,
  resolvePointElevationReferenceAnnotationId,
} from "./pointToolElevationDisplay";

export const createPointToolInfoBoxSlots = (
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
        new Map(nodes.map((node) => [node.id, node.coordinate]))
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
        onSetReference={
          isReferenceMeasurement
            ? undefined
            : (event) => {
                event.stopPropagation();
                setElevationReferenceAnnotationId(annotation.id);
              }
        }
        onToggleLock={(event) => {
          event.stopPropagation();
          toggleAnnotationLocked(annotation.id);
        }}
        onDelete={(event) => {
          event.stopPropagation();
          removeAnnotationById(annotation.id);
        }}
        visualOptions={infoBoxVisualOptions}
        dataTestIdPrefix="carma-v2-point-measurement"
        dataTestIds={{
          flyTo: "carma-v2-flyto-point-measurement-btn",
          export: "carma-v2-export-point-measurement-geojson-btn",
          visibility: "carma-v2-toggle-point-measurement-visibility-btn",
          reference: "carma-v2-set-reference-point-measurement-btn",
          lock: "carma-v2-toggle-point-measurement-lock-btn",
          delete: "carma-v2-delete-point-measurement-btn",
        }}
      />
    );

    return {
      headingTitle,
      headingColor,
      actions: actionIcons,
      subtitle: (
        <div className={infoBoxVisualOptions.subtitleContainerClassName}>
          <div className="flex items-center justify-between gap-2">
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
          <div
            className={infoBoxVisualOptions.subtitleMetaTextClassName}
            style={infoBoxVisualOptions.subtitleMetaTextStyle}
          >
            {`${latitude} ${longitude} • ${elevationText}`}
          </div>
        </div>
      ),
      content: (
        <div
          className={`${infoBoxVisualOptions.bodyContainerClassName} ${infoBoxVisualOptions.bodyTextClassName}`}
          style={infoBoxVisualOptions.bodyTextStyle}
        >
          <div>
            {formatPointRelativeHeightInfoText({
              coordinate,
              referenceCoordinate,
              formatOptions,
            })}
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
