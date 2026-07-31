import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import { useAddonState } from "@carma-mapping/addons";

import { getUIMode, setUIMode, UIMode } from "../store/slices/ui";

export const useHighlightModeSync = () => {
  const dispatch = useDispatch();
  const uiMode = useSelector(getUIMode);
  const [highlightMode, setHighlightMode] = useAddonState("highlightMode");
  const isHighlighting = highlightMode?.isOn ?? false;

  const previousUIMode = useRef(uiMode);
  useEffect(() => {
    const otherModeStarted =
      previousUIMode.current !== uiMode && uiMode !== UIMode.DEFAULT;
    previousUIMode.current = uiMode;
    if (otherModeStarted) {
      setHighlightMode({ isOn: false });
    }
  }, [uiMode, setHighlightMode]);

  const previousIsHighlighting = useRef(isHighlighting);
  useEffect(() => {
    const highlightingStarted =
      !previousIsHighlighting.current && isHighlighting;
    previousIsHighlighting.current = isHighlighting;
    if (highlightingStarted) {
      dispatch(setUIMode(UIMode.DEFAULT));
    }
  }, [isHighlighting, dispatch]);
};
