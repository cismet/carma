import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useAddonState, useMeasurement3dActions } from "@carma-mapping/addons";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { getUIMode, setUIMode, UIMode } from "../store/slices/ui";

/**
 * Keeps the 3D measurement tool exclusive with the other map modes (`UIMode`
 * and highlighting), pauses it while the Cesium globe covers the MapLibre
 * view and shows the experimental tools with the Cesium measurement's flag.
 * The tool takes the map from the other modes once it can measure; switched
 * on without a surface it waits and leaves them alone.
 */
export const useMeasurement3dModeSync = () => {
  const dispatch = useDispatch();
  const uiMode = useSelector(getUIMode);
  const { isOn, available, endMode, setViewHidden, setShowAllTools } =
    useMeasurement3dActions();
  const isMeasuring = isOn && available;
  const { isCesium } = useMapFrameworkSwitcherContext();
  const flags = useFeatureFlags();
  const showAllTools = flags.featureFlagCesiumAnnotationAllTools === true;
  useEffect(() => {
    setViewHidden(isCesium);
  }, [isCesium, setViewHidden]);
  useEffect(() => {
    setShowAllTools(showAllTools);
  }, [showAllTools, setShowAllTools]);
  const [highlightMode, setHighlightMode] = useAddonState("highlightMode");
  const isHighlighting = highlightMode?.isOn ?? false;
  const previousUIMode = useRef(uiMode);
  useEffect(() => {
    const otherModeStarted =
      previousUIMode.current !== uiMode && uiMode !== UIMode.DEFAULT;
    previousUIMode.current = uiMode;
    if (otherModeStarted) {
      endMode();
    }
  }, [uiMode, endMode]);
  const previousIsHighlighting = useRef(isHighlighting);
  useEffect(() => {
    const highlightingStarted =
      !previousIsHighlighting.current && isHighlighting;
    previousIsHighlighting.current = isHighlighting;
    if (highlightingStarted) {
      endMode();
    }
  }, [isHighlighting, endMode]);
  const previousIsMeasuring = useRef(isMeasuring);
  useEffect(() => {
    const started = !previousIsMeasuring.current && isMeasuring;
    previousIsMeasuring.current = isMeasuring;
    if (started) {
      dispatch(setUIMode(UIMode.DEFAULT));
      setHighlightMode({ isOn: false });
    }
  }, [isMeasuring, dispatch, setHighlightMode]);
};
