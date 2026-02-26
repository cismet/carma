import { isPointMeasurementEntry } from "@carma-mapping/engines/cesium/measurements";
import { InfoBoxMeasurement3DRelativeElevationContent } from "./InfoBoxMeasurement3DRelativeElevationContent";
import type { PointDistanceCommonProps } from "./InfoBoxMeasurement3DPointDistance.types";

type InfoBoxMeasurement3DPointContentProps = PointDistanceCommonProps & {
  isLivePreview: boolean;
};

export const InfoBoxMeasurement3DPointContent = ({
  isLivePreview,
  currentMeasurement,
  ...relativeElevationProps
}: InfoBoxMeasurement3DPointContentProps) => {
  const canRenderPointContent =
    isLivePreview ||
    (Boolean(currentMeasurement) &&
      isPointMeasurementEntry(currentMeasurement));

  if (!canRenderPointContent) {
    return null;
  }

  return (
    <div className="text-[12px] mb-0">
      <div className="mt-1 text-sm pl-2">
        <div className="pr-1 flex items-center gap-1">
          <InfoBoxMeasurement3DRelativeElevationContent
            {...relativeElevationProps}
            interactive={!isLivePreview}
          />
        </div>
      </div>
    </div>
  );
};
