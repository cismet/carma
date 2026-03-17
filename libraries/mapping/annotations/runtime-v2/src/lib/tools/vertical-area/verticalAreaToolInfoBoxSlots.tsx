import {
  formatAreaAdaptive,
  formatNumber,
} from "@carma-mapping/annotations/core";

import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotationInfoBox.types";

export const createVerticalAreaToolInfoBoxSlots = ({
  toolType,
  headingTitle,
  formatMeasurementLabelToken,
}: {
  toolType: RuntimeAnnotationInfoBoxContext["annotation"]["toolType"];
  headingTitle: string;
  formatMeasurementLabelToken: (counter: number) => string;
}) => {
  return ({ annotation, annotationEntries }: RuntimeAnnotationInfoBoxContext) => {
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
          <div>{`Fläche: ${formatAreaAdaptive(areaSquareMeters)}`}</div>
          <div>{`Vertikalität: ${formatNumber(verticalityDeg)}°`}</div>
          {Number.isFinite(bearingDeg) ? (
            <div>{`Ausrichtung: ${formatNumber(bearingDeg ?? 0)}°`}</div>
          ) : null}
        </div>
      ),
      collapsible: true,
    };
  };
};
