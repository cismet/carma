import { useEffect } from "react";
import { UIMode, useUIMode } from "../store/slices/ui";

export const useFeatureInfoModeCursorStyle = (topicMapElementId: string = "routedMap") => {
  const uiMode = useUIMode();
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  useEffect(() => {
    const mapElement = document.getElementById(topicMapElementId);
    if (mapElement) {
      mapElement.style.cursor = isModeFeatureInfo ? "crosshair" : "pointer";
    }
  }, [isModeFeatureInfo, topicMapElementId]);
};
