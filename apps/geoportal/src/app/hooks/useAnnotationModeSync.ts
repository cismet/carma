import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import { useAddonState } from "@carma-mapping/addons";

import { getUIMode, setUIMode, UIMode } from "../store/slices/ui";

/**
 * Keeps the annotation exclusive with the app's other map modes, the way
 * `useHighlightModeSync` does for the highlighting: measurement, feature info
 * and print run through `UIMode`, the highlighting through its own channel, so
 * both have to be watched.
 */
export const useAnnotationModeSync = () => {
  const dispatch = useDispatch();
  const uiMode = useSelector(getUIMode);
  const [annotationMode, setAnnotationMode] = useAddonState("annotationMode");
  const [highlightMode, setHighlightMode] = useAddonState("highlightMode");
  const isAnnotating = annotationMode?.isOn ?? false;
  const isHighlighting = highlightMode?.isOn ?? false;

  const previousUIMode = useRef(uiMode);
  useEffect(() => {
    const otherModeStarted =
      previousUIMode.current !== uiMode && uiMode !== UIMode.DEFAULT;
    previousUIMode.current = uiMode;
    if (otherModeStarted) {
      setAnnotationMode((previous) => ({ ...(previous ?? {}), isOn: false }));
    }
  }, [uiMode, setAnnotationMode]);

  const previousIsHighlighting = useRef(isHighlighting);
  useEffect(() => {
    const highlightingStarted =
      !previousIsHighlighting.current && isHighlighting;
    previousIsHighlighting.current = isHighlighting;
    if (highlightingStarted) {
      setAnnotationMode((previous) => ({ ...(previous ?? {}), isOn: false }));
    }
  }, [isHighlighting, setAnnotationMode]);

  const previousIsAnnotating = useRef(isAnnotating);
  useEffect(() => {
    const annotatingStarted = !previousIsAnnotating.current && isAnnotating;
    previousIsAnnotating.current = isAnnotating;
    if (annotatingStarted) {
      dispatch(setUIMode(UIMode.DEFAULT));
      setHighlightMode({ isOn: false });
    }
  }, [isAnnotating, dispatch, setHighlightMode]);
};
