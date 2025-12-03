import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useMapMeasurementsContext } from "@carma-commons/measurements";
import { getUIMode, setUIMode, toggleUIMode, UIMode } from "../store/slices/ui";
import { useFeatureInfoModeCursorStyle } from "./useFeatureInfoModeCursorStyle";
import { cancelOngoingRequests } from "../components/GeoportalMap/topicmap.utils";

export const useMapModes = () => {
  const dispatch = useDispatch();
  const uiMode = useSelector(getUIMode);
  const { isMeasurementEnabled, setMeasurementEnabled } =
    useMapMeasurementsContext();
  const prevUiModeRef = useRef(uiMode);

  useFeatureInfoModeCursorStyle();

  useEffect(() => {
    const justSwitchedToFeatureInfo =
      uiMode === UIMode.FEATURE_INFO &&
      prevUiModeRef.current !== UIMode.FEATURE_INFO;

    if (justSwitchedToFeatureInfo) {
      if (isMeasurementEnabled) {
        setMeasurementEnabled(false);
      }
    } else {
      // sync legacy redux measurement mode with ui mode, remove once measurement provider handles this fully
      if (isMeasurementEnabled && uiMode !== UIMode.MEASUREMENT) {
        dispatch(setUIMode(UIMode.MEASUREMENT));
      } else if (!isMeasurementEnabled && uiMode === UIMode.MEASUREMENT) {
        dispatch(setUIMode(UIMode.DEFAULT));
      }
    }
    prevUiModeRef.current = uiMode;
  }, [isMeasurementEnabled, uiMode, dispatch, setMeasurementEnabled]);

  // Prevent cursor race condition when switching from Measurement to Feature Info
  // The measurement tool resets cursor to 'pointer' when disabled, overriding Feature Info's 'crosshair'
  useEffect(() => {
    if (uiMode === UIMode.FEATURE_INFO && !isMeasurementEnabled) {
      const mapElement = document.getElementById("routedMap");
      if (mapElement) {
        mapElement.style.cursor = "crosshair";
      }
    }
  }, [uiMode, isMeasurementEnabled]);

  const handleToggleFeatureInfo = () => {
    cancelOngoingRequests();
    dispatch(toggleUIMode(UIMode.FEATURE_INFO));
  };

  return { handleToggleFeatureInfo };
};
