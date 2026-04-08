import { formatLatLonDegrees } from "@carma-units";
import type { Degrees } from "@carma-units";

import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotationInfoBox.types";
import { RuntimeAnnotationInfoBoxNavigation } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxNavigation";
import { resolveRuntimeMeasurementNavigation } from "../../components/annotation-info-box/runtimeMeasurementNavigation";
import { resolveMeasurementCoordinates } from "../../render/resolveMeasurementCoordinates";
export const createPointToolInfoBoxSlots = (
  toolType: RuntimeAnnotationInfoBoxContext["annotation"]["toolType"],
  {
    headingTitle,
    formatMeasurementLabelToken,
    formatCoordinateValue,
  }: {
    headingTitle: string;
    formatMeasurementLabelToken: (counter: number) => string;
    formatCoordinateValue: (value: number) => string;
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
      setSelectedAnnotationId,
    });

    if (!coordinate) {
      return null;
    }

    const shortLabelToken = formatMeasurementLabelToken(pointOrder);
    const defaultDisplayName = `${headingTitle} ${shortLabelToken}`;
    const displayName = annotation.displayName?.trim() || defaultDisplayName;
    const [latitude, longitude] = formatLatLonDegrees(
      coordinate.latitude as Degrees,
      coordinate.longitude as Degrees,
      {
        fractionDigits: 6,
        locale: "de-DE",
      }
    );
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
            <span className="text-[#6b7280]">Breite</span>
            <span>{latitude}</span>
            <span className="text-[#6b7280]">Länge</span>
            <span>{longitude}</span>
            <span className="text-[#6b7280]">NHN</span>
            <span>{`${formatCoordinateValue(coordinate.altitude)} m`}</span>
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
