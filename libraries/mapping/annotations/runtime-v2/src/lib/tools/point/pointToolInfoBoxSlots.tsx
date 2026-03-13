import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotationInfoBox.types";
import { resolveMeasurementCoordinates } from "../../render/resolveMeasurementCoordinates";

export const createPointToolInfoBoxSlots = ({
  toolType,
  headingTitle,
  formatMeasurementLabelToken,
  formatCoordinateValue,
}: {
  toolType: RuntimeAnnotationInfoBoxContext["annotation"]["toolType"];
  headingTitle: string;
  formatMeasurementLabelToken: (counter: number) => string;
  formatCoordinateValue: (value: number) => string;
}) => {
  return ({
    annotation,
    annotationEntries,
    nodes,
  }: RuntimeAnnotationInfoBoxContext) => {
    if (annotation.toolType !== toolType) {
      return null;
    }

    const pointMeasurements = annotationEntries.filter(
      (candidateMeasurement) => candidateMeasurement.toolType === toolType
    );
    const pointOrder =
      pointMeasurements.findIndex(
        (candidateMeasurement) => candidateMeasurement.id === annotation.id
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

    return {
      headingTitle,
      subtitle: (
        <div className="text-[12px] leading-normal text-[#212529]">
          {`${headingTitle} ${shortLabelToken}`}
        </div>
      ),
      content: (
        <div className="text-[12px] leading-normal text-[#212529]">
          <div>{`${formatCoordinateValue(
            coordinate.latitude
          )}° N ${formatCoordinateValue(coordinate.longitude)}° O`}</div>
          <div>{`NHN ${formatCoordinateValue(coordinate.altitude)} m`}</div>
        </div>
      ),
      collapsible: true,
    };
  };
};
