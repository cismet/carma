import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useMeasurement3dActions } from "@carma-mapping/addons";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { getLibre3d, getUIMode, setUIMode, UIMode } from "../store/slices/ui";

/**
 * Makes the 3D measurement the measurement mode of the maplibre 3D view: it
 * is on exactly while `UIMode.MEASUREMENT` is, so the measurement button
 * drives it and the other modes end it the way they end the 2D measurement.
 * Switched on or off from elsewhere (its layer row, a shared set) it moves
 * the mode along. Outside the maplibre 3D view it stays off. It also shows
 * the experimental tools with `featureFlagCesiumAnnotationAllTools`.
 */
export const useMeasurement3dModeSync = () => {
  const dispatch = useDispatch();
  const isModeMeasurement = useSelector(getUIMode) === UIMode.MEASUREMENT;
  const libre3d = useSelector(getLibre3d);
  const { isOn, setOn, setShowAllTools } =
    useMeasurement3dActions();
  const flags = useFeatureFlags();
  const showAllTools = flags.featureFlagCesiumAnnotationAllTools === true;
  useEffect(() => {
    setShowAllTools(showAllTools);
  }, [showAllTools, setShowAllTools]);
  const previousIsOn = useRef(isOn);
  useEffect(() => {
    const isOnChanged = previousIsOn.current !== isOn;
    previousIsOn.current = isOn;
    const wanted = libre3d && isModeMeasurement;
    if (isOn === wanted) {
      return;
    }
    if (isOnChanged && libre3d) {
      dispatch(setUIMode(isOn ? UIMode.MEASUREMENT : UIMode.DEFAULT));
      return;
    }
    setOn(wanted);
  }, [libre3d, isModeMeasurement, isOn, dispatch, setOn]);
};
