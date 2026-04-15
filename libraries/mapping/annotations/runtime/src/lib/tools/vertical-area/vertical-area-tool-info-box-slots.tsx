import { formatAreaSquareMetersAdaptive, formatDegrees } from "@carma-units";
import {
  AnnotationInfoBoxActions,
  AnnotationInfoBoxNavigation,
  AnnotationInfoBoxTitleInput,
} from "@carma-mapping/annotations/ui";

import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotation-info-box.types";
import { resolveRuntimeMeasurementNavigation } from "../../components/annotation-info-box/runtime-measurement-navigation";
export const createVerticalAreaToolInfoBoxSlots = (
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
    const shortLabelToken = formatMeasurementLabelToken(measurementOrder);
    const navigation = resolveRuntimeMeasurementNavigation({
      annotationEntries,
      selectedAnnotationId: annotation.id,
      focusAnnotationId,
      flyToAllAnnotations,
    });
    const verticalityDeg = annotation.verticalityDeg ?? 0;
    const areaSquareMeters = Math.max(0, annotation.areaSquareMeters ?? 0);
    const bearingDeg = annotation.bearingDeg;
    const defaultDisplayName = headingTitle;
    const effectiveShortLabel =
      annotation.shortLabel?.trim() || shortLabelToken;
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
        onToggleLock={(event) => {
          event.stopPropagation();
          toggleAnnotationLocked(annotation.id);
        }}
        onDelete={(event) => {
          event.stopPropagation();
          removeAnnotationById(annotation.id);
        }}
        visualOptions={infoBoxVisualOptions}
        dataTestIdPrefix="carma-annotation-vertical-area-measurement"
        dataTestIds={{
          flyTo: "carma-annotation-flyto-vertical-area-measurement-btn",
          export:
            "carma-annotation-export-vertical-area-measurement-geojson-btn",
          visibility:
            "carma-annotation-toggle-vertical-area-measurement-visibility-btn",
          lock: "carma-annotation-toggle-vertical-area-measurement-lock-btn",
          delete: "carma-annotation-delete-vertical-area-measurement-btn",
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
        </div>
      ),
      content: (
        <div
          className={`${infoBoxVisualOptions.bodyContainerClassName} ${infoBoxVisualOptions.bodyTextClassName}`}
          style={infoBoxVisualOptions.bodyTextStyle}
        >
          <div>{`Fläche: ${formatAreaSquareMetersAdaptive(
            areaSquareMeters,
            formatOptions.areaSquareMeters
          )}`}</div>
          <div>{`Vertikalität: ${formatDegrees(
            verticalityDeg,
            formatOptions.degrees
          )}`}</div>
          {Number.isFinite(bearingDeg) ? (
            <div>{`Ausrichtung: ${formatDegrees(
              bearingDeg ?? 0,
              formatOptions.degrees
            )}`}</div>
          ) : null}
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
