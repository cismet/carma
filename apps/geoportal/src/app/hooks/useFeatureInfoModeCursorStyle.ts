import { useEffect } from "react";
import { useSelector } from "react-redux";
import type maplibregl from "maplibre-gl";
import { getUIMode, UIMode } from "../store/slices/ui";

export const useFeatureInfoModeCursorStyle = (
  topicMapElementId: string = "routedMap",
  libreMap?: maplibregl.Map | null
) => {
  const uiMode = useSelector(getUIMode);
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  useEffect(() => {
    const mapElement =
      document.getElementById(topicMapElementId) || libreMap?.getCanvas();
    if (mapElement) {
      mapElement.style.cursor = isModeFeatureInfo ? "crosshair" : "pointer";
    }
  }, [isModeFeatureInfo, topicMapElementId, libreMap]);
};
