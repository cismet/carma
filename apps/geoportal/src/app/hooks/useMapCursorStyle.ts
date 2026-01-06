import { useEffect } from "react";
import { useSelector } from "react-redux";
import { getUIMode, UIMode } from "../store/slices/ui";
import { useMapMeasurementsContext } from "@carma-commons/measurements";

export const useMapCursorStyle = (topicMapElementId: string = "routedMap") => {
  const uiMode = useSelector(getUIMode);
  const { isMeasurementEnabled } = useMapMeasurementsContext();

  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;

  // Determine if we should show crosshair (either Feature Info OR Measurement)
  const shouldShowCrosshair = isModeFeatureInfo || isMeasurementEnabled;

  useEffect(() => {
    const mapElement = document.getElementById(topicMapElementId);
    if (mapElement) {
      mapElement.style.cursor = shouldShowCrosshair ? "crosshair" : "pointer";
    }
  }, [shouldShowCrosshair, topicMapElementId, isMeasurementEnabled]);
};
