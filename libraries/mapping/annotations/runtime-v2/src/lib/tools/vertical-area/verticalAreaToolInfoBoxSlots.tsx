import {
  formatAreaSquareMetersAdaptive,
  formatDegrees,
} from "@carma/units/helpers";

import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotationInfoBox.types";
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
    const verticalityDeg = annotation.verticalityDeg ?? 0;
    const areaSquareMeters = Math.max(0, annotation.areaSquareMeters ?? 0);
    const bearingDeg = annotation.bearingDeg;

    return {
      headingTitle,
      subtitle: (
        <div className="text-[12px] leading-normal text-[#212529]">
          {`${headingTitle} ${shortLabelToken}`}
        </div>
      ),
      content: (
        <div className="text-[12px] leading-normal text-[#212529]">
          <div>{`Fläche: ${formatAreaSquareMetersAdaptive(areaSquareMeters, {
            locale: "de-DE",
          })}`}</div>
          <div>{`Vertikalität: ${formatDegrees(verticalityDeg, {
            locale: "de-DE",
          })}`}</div>
          {Number.isFinite(bearingDeg) ? (
            <div>{`Ausrichtung: ${formatDegrees(bearingDeg ?? 0, {
              locale: "de-DE",
            })}`}</div>
          ) : null}
        </div>
      ),
      collapsible: true,
    };
  };
};
