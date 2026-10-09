import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useAddonState, useMeasurement3dActions } from "@carma-mapping/addons";
import { getUIMode, setUIMode, UIMode } from "../store/slices/ui";

/**
 * Keeps the 3D measurement tool exclusive with the app's other map modes, the
 * way `useAnnotationModeSync` does for the sketch: the 2D measurement, feature
 * info and print modes run through `UIMode`, the highlighting through its own
 * channel.
 */
export const useMeasurement3dModeSync = () => {
  const dispatch = useDispatch();
  const uiMode = useSelector(getUIMode);
  const { isOn, endMode } = useMeasurement3dActions();
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
  const previousIsOn = useRef(isOn);
  useEffect(() => {
    const started = !previousIsOn.current && isOn;
    previousIsOn.current = isOn;
    if (started) {
      dispatch(setUIMode(UIMode.DEFAULT));
      setHighlightMode({ isOn: false });
    }
  }, [isOn, dispatch, setHighlightMode]);
};
