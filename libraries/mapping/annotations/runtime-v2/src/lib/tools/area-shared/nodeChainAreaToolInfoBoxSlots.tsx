import { faCrosshairs, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { Cartesian3 } from "@carma-cesium";
import { cartesian3FromGeographicCoordinate } from "@carma-mapping/engines/cesium/core";
import {
  formatAreaSquareMetersAdaptive,
  formatDegrees,
  formatLengthMeters,
} from "@carma-units";

import { RuntimeAnnotationInfoBoxActionIcon } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxActionIcon";
import { RuntimeAnnotationInfoBoxNavigation } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxNavigation";
import { RuntimeAnnotationInfoBoxTitleInput } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxTitleInput";
import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotationInfoBox.types";
import { resolveRuntimeMeasurementNavigation } from "../../components/annotation-info-box/runtimeMeasurementNavigation";
import { resolveMeasurementCoordinates } from "../../render/resolveMeasurementCoordinates";

const computePerimeterMeters = (
  coordinates: readonly {
    longitude: number;
    latitude: number;
    altitude: number;
  }[]
) => {
  if (coordinates.length < 2) {
    return 0;
  }

  const pointsECEF = coordinates.map(cartesian3FromGeographicCoordinate);
  let perimeterMeters = 0;

  for (let index = 0; index < pointsECEF.length; index += 1) {
    const startPoint = pointsECEF[index];
    const endPoint = pointsECEF[(index + 1) % pointsECEF.length];
    if (!startPoint || !endPoint) {
      continue;
    }

    perimeterMeters += Cartesian3.distance(startPoint, endPoint);
  }

  return perimeterMeters;
};

export const createNodeChainAreaToolInfoBoxSlots = (
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
    const perimeterMeters = computePerimeterMeters(coordinates);
    const areaSquareMeters = Math.max(0, annotation.areaSquareMeters ?? 0);
    const verticalityDeg = annotation.verticalityDeg;
    const bearingDeg = annotation.bearingDeg;
    const shortLabelToken = formatMeasurementLabelToken(measurementOrder);
    const defaultDisplayName = `${headingTitle} ${formatMeasurementLabelToken(
      measurementOrder
    )}`;
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
            dataTestId="carma-v2-flyto-area-measurement-btn"
            visualOptions={infoBoxVisualOptions}
          />
          <RuntimeAnnotationInfoBoxActionIcon
            title="Löschen"
            icon={faTrashCan}
            onClick={(event) => {
              event.stopPropagation();
              removeAnnotationById(annotation.id);
            }}
            dataTestId="carma-v2-delete-area-measurement-btn"
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
          <div>{`Umfang: ${formatLengthMeters(
            perimeterMeters,
            formatOptions.lengthMeters
          )}`}</div>
          {Number.isFinite(verticalityDeg) ? (
            <div>{`Vertikalität: ${formatDegrees(
              verticalityDeg ?? 0,
              formatOptions.degrees
            )}`}</div>
          ) : null}
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
