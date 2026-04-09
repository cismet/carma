import {
  faArrowsDownToLine,
  faCrosshairs,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { formatLatLonDegrees, formatLengthMeters } from "@carma-units";
import type { Degrees } from "@carma-units";

import { RuntimeAnnotationInfoBoxActionIcon } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxActionIcon";
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
    nodes,
    removeAnnotationById,
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
    const defaultDisplayName = `${headingTitle} ${shortLabelToken}`;
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
            dataTestId="carma-v2-flyto-point-measurement-btn"
            visualOptions={infoBoxVisualOptions}
          />
          {!isReferenceMeasurement ? (
            <RuntimeAnnotationInfoBoxActionIcon
              title="Als Referenzhöhe setzen"
              icon={faArrowsDownToLine}
              onClick={(event) => {
                event.stopPropagation();
                setElevationReferenceAnnotationId(annotation.id);
              }}
              dataTestId="carma-v2-set-reference-point-measurement-btn"
              visualOptions={infoBoxVisualOptions}
            />
          ) : null}
          <RuntimeAnnotationInfoBoxActionIcon
            title="Löschen"
            icon={faTrashCan}
            onClick={(event) => {
              event.stopPropagation();
              removeAnnotationById(annotation.id);
            }}
            dataTestId="carma-v2-delete-point-measurement-btn"
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
          <div className={infoBoxVisualOptions.subtitleMetaTextClassName}>
            {`${latitude} ${longitude} • ${elevationText}`}
          </div>
        </div>
      ),
      content: (
        <div
          className={`${infoBoxVisualOptions.bodyContainerClassName} ${infoBoxVisualOptions.bodyTextClassName}`}
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
