import { useMemo } from "react";
import { usePointLabels, type PointLabelData } from "../../overlay";
import { PointMeasurementEntry } from "../types/MeasurementTypes";
import { formatNumberToEnclosed } from "../utils/cesiumLabels";

export const useCesiumPointLabels = (
  points: PointMeasurementEntry[],
  showLabels: boolean,
  referenceElevation: number = 0
) => {
  // Transform measurement points to point label data
  const pointLabelData: PointLabelData[] = useMemo(() => 
    points.map((point, index) => ({
      id: point.id,
      position: point.geometryECEF,
      text: `${formatNumberToEnclosed(index + 1)} ${(
        point.geometryWGS84.height - referenceElevation
      ).toFixed(2)}m`,
      selected: point.isSelected,
      visible: true,
    })), 
    [points, referenceElevation]
  );

  // Use the built-in point labels hook - no more HTML string management!
  usePointLabels(pointLabelData, showLabels);
};

export default useCesiumPointLabels;
