import { formatLatLonDegrees } from "@carma/units/helpers";
import type { Degrees } from "@carma/units/types";
import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotationInfoBox.types";
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

    if (!coordinate) {
      return null;
    }

    const shortLabelToken = formatMeasurementLabelToken(pointOrder);
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
        <div className="text-[12px] leading-normal text-[#212529]">
          {`${headingTitle} ${shortLabelToken}`}
        </div>
      ),
      content: (
        <div className="text-[12px] leading-normal text-[#212529]">
          <div>{`${latitude} ${longitude}`}</div>
          <div>{`NHN ${formatCoordinateValue(coordinate.altitude)} m`}</div>
        </div>
      ),
      collapsible: true,
    };
  };
};
