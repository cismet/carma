import { faCrosshairs, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { formatAreaSquareMetersAdaptive, formatDegrees } from "@carma-units";

import { RuntimeAnnotationInfoBoxActionIcon } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxActionIcon";
import { RuntimeAnnotationInfoBoxNavigation } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxNavigation";
import { RuntimeAnnotationInfoBoxTitleInput } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxTitleInput";
import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotationInfoBox.types";
import { resolveRuntimeMeasurementNavigation } from "../../components/annotation-info-box/runtimeMeasurementNavigation";
export const createVerticalAreaToolInfoBoxSlots = (
  toolType: RuntimeAnnotationInfoBoxContext["annotation"]["toolType"],
  {
    headingTitle,
    formatMeasurementLabelToken,
  }: {
    headingTitle: string;
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
    const defaultDisplayName = `${headingTitle} ${shortLabelToken}`;
    const effectiveShortLabel =
      annotation.shortLabel?.trim() || shortLabelToken;

    return {
      headingTitle,
      actions: (
        <div className="flex items-center gap-2">
          <RuntimeAnnotationInfoBoxActionIcon
            title="Zur Messung fliegen"
            icon={faCrosshairs}
            onClick={(event) => {
              event.stopPropagation();
              focusAnnotationId(annotation.id);
            }}
            dataTestId="carma-v2-flyto-vertical-area-measurement-btn"
            visualOptions={infoBoxVisualOptions}
          />
          <RuntimeAnnotationInfoBoxActionIcon
            title="Löschen"
            icon={faTrashCan}
            onClick={(event) => {
              event.stopPropagation();
              removeAnnotationById(annotation.id);
            }}
            dataTestId="carma-v2-delete-vertical-area-measurement-btn"
            visualOptions={infoBoxVisualOptions}
          />
        </div>
      ),
      subtitle: (
        <div className={infoBoxVisualOptions.subtitleContainerClassName}>
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
      ),
      content: (
        <div
          className={`${infoBoxVisualOptions.bodyContainerClassName} ${infoBoxVisualOptions.bodyTextClassName}`}
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
