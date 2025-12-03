import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useMapMeasurementsContext } from "@carma-commons/measurements";
import { getUIMode, setUIMode, toggleUIMode, UIMode } from "../store/slices/ui";
import { cancelOngoingRequests } from "../components/GeoportalMap/topicmap.utils";

export const useMapModes = () => {
  const dispatch = useDispatch();
  const uiMode = useSelector(getUIMode);
  const { isMeasurementEnabled, setMeasurementEnabled } =
    useMapMeasurementsContext();
  const prevUiModeRef = useRef(uiMode);

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

  const handleToggleFeatureInfo = () => {
    cancelOngoingRequests();
    dispatch(toggleUIMode(UIMode.FEATURE_INFO));
  };

  return { handleToggleFeatureInfo };
};
