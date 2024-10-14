import { useEffect } from "react";
import { useSelector } from "react-redux";

import { UIMode, getUIMode } from "../store/slices/ui";

export const useFeatureInfoModeCursorStyle = (topicMapElementId: string = "routedMap") => {
  const uiMode = useSelector(getUIMode);
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  useEffect(() => {
    const mapElement = document.getElementById(topicMapElementId);
    if (mapElement) {
      mapElement.style.cursor = isModeFeatureInfo ? "crosshair" : "pointer";
    }
  }, [isModeFeatureInfo, topicMapElementId]);
};
