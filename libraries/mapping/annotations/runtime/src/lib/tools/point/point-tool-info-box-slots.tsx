import { formatLatLonDegrees, formatLengthMeters } from "@carma-units";
import type { Degrees } from "@carma-units";
import {
  AnnotationInfoBoxActions,
  AnnotationInfoBoxMetaText,
  AnnotationInfoBoxNavigation,
  AnnotationInfoBoxTitleInput,
} from "@carma-mapping/annotations/ui";

import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotation-info-box.types";
import { resolveRuntimeMeasurementNavigation } from "../../components/annotation-info-box/runtime-measurement-navigation";
import { resolveMeasurementCoordinates } from "../../render/resolve-measurement-coordinates";
import {
  formatPointRelativeHeightInfoText,
  resolvePointElevationReferenceCoordinate,
  resolvePointElevationReferenceAnnotationId,
} from "./point-tool-elevation-display";

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
      <AnnotationInfoBoxActions
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
        dataTestIdPrefix="carma-annotation-point-measurement"
        dataTestIds={{
          flyTo: "carma-annotation-flyto-point-measurement-btn",
          export: "carma-annotation-export-point-measurement-geojson-btn",
          visibility:
            "carma-annotation-toggle-point-measurement-visibility-btn",
          reference: "carma-annotation-set-reference-point-measurement-btn",
          lock: "carma-annotation-toggle-point-measurement-lock-btn",
          delete: "carma-annotation-delete-point-measurement-btn",
        }}
      />
    );

    return {
      headingTitle,
      headingColor,
      subtitle: (
        <div className={infoBoxVisualOptions.subtitleContainerClassName}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <AnnotationInfoBoxTitleInput
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
          <AnnotationInfoBoxMetaText visualOptions={infoBoxVisualOptions}>
            {`${latitude} ${longitude} • ${elevationText}`}
          </AnnotationInfoBoxMetaText>
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
        <AnnotationInfoBoxNavigation
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
