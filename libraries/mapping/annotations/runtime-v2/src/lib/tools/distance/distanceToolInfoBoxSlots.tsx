import { Cartesian3 } from "@carma-cesium";
import { cartesian3FromGeographicCoordinate } from "@carma-mapping/engines/cesium/core";
import { CarmaTransforms } from "@carma-mapping/engines/cesium/core";
import {
  formatLengthMeters,
  LENGTH_UNIT_MODE,
} from "@carma-units";

import { RuntimeAnnotationInfoBoxNavigation } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxNavigation";
import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotationInfoBox.types";
import { resolveRuntimeMeasurementNavigation } from "../../components/annotation-info-box/runtimeMeasurementNavigation";
import { resolveMeasurementCoordinates } from "../../render/resolveMeasurementCoordinates";

export const createDistanceToolInfoBoxSlots = (
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
      setSelectedAnnotationId,
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
    const defaultDisplayName = `${headingTitle} ${shortLabelToken}`;
    const displayName = annotation.displayName?.trim() || defaultDisplayName;
    const formatDistance = (value: number) =>
      formatLengthMeters(value, {
        locale: "de-DE",
        unitMode: LENGTH_UNIT_MODE.METERS,
      });

    return {
      headingTitle,
      subtitle: (
        <div className="mt-1 mb-0 w-full px-3">
          <div className="font-bold leading-snug text-[#111827] break-words">
            {displayName}
          </div>
          <div className="text-[11px] leading-normal text-[#6b7280]">
            {`Kurzlabel ${shortLabelToken}`}
          </div>
        </div>
      ),
      content: (
        <div className="px-3 pb-2 pt-1 text-[12px] leading-normal text-[#212529]">
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
            <span className="text-[#6b7280]">Direkt</span>
            <span>{formatDistance(directDistanceMeters)}</span>
            <span className="text-[#6b7280]">Horizontal</span>
            <span>{formatDistance(horizontalDistanceMeters)}</span>
            <span className="text-[#6b7280]">Vertikal</span>
            <span>{formatDistance(verticalDistanceMeters)}</span>
          </div>
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
