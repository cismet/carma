import {
  Cartesian3,
} from "@carma-cesium";
import {
  cartesian3FromGeographicCoordinate,
} from "@carma-mapping/engines/cesium/core";
import {
  formatAreaSquareMetersAdaptive,
  formatDegrees,
  formatLengthMeters,
  LENGTH_UNIT_MODE,
} from "@carma-units";

import { RuntimeAnnotationInfoBoxNavigation } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxNavigation";
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
    nodes,
    setSelectedAnnotationId,
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
      setSelectedAnnotationId,
    });
    const perimeterMeters = computePerimeterMeters(coordinates);
    const areaSquareMeters = Math.max(0, annotation.areaSquareMeters ?? 0);
    const verticalityDeg = annotation.verticalityDeg;
    const bearingDeg = annotation.bearingDeg;

    return {
      headingTitle,
      subtitle: (
        <div className="text-[12px] leading-normal text-[#212529]">
          {`${headingTitle} ${formatMeasurementLabelToken(measurementOrder)}`}
        </div>
      ),
      content: (
        <div className="text-[12px] leading-normal text-[#212529]">
          <div>{`Fläche: ${formatAreaSquareMetersAdaptive(areaSquareMeters, {
            locale: "de-DE",
          })}`}</div>
          <div>{`Umfang: ${formatLengthMeters(perimeterMeters, {
            locale: "de-DE",
            unitMode: LENGTH_UNIT_MODE.METERS,
          })}`}</div>
          {Number.isFinite(verticalityDeg) ? (
            <div>{`Vertikalität: ${formatDegrees(verticalityDeg ?? 0, {
              locale: "de-DE",
            })}`}</div>
          ) : null}
          {Number.isFinite(bearingDeg) ? (
            <div>{`Ausrichtung: ${formatDegrees(bearingDeg ?? 0, {
              locale: "de-DE",
            })}`}</div>
          ) : null}
        </div>
      ),
      footer: (
        <RuntimeAnnotationInfoBoxNavigation
          totalEntries={navigation?.totalEntries ?? 0}
          currentIndex={navigation?.currentIndex ?? 0}
          onPreviousMeasurement={() =>
            navigation?.selectRelativeMeasurement(-1)
          }
          onNextMeasurement={() => navigation?.selectRelativeMeasurement(1)}
        />
      ),
      collapsible: true,
    };
  };
};
