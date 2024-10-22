import { useCallback, useEffect, useState } from "react";
import { useDispatch } from "react-redux";

import { SceneStyles } from "../..";
import {
  setShowPrimaryTileset,
  setShowSecondaryTileset,
} from "../slices/cesium";
import { setupPrimaryStyle, setupSecondaryStyle } from "../utils/sceneStyles";

import { useCesiumContext } from "../CesiumContextProvider";

export const useSceneStyleToggle = (
  initialStyle: keyof SceneStyles = "secondary",
) => {
  const dispatch = useDispatch();
  const [currentStyle, setCurrentStyle] =
    useState<keyof SceneStyles>(initialStyle);
  const context = useCesiumContext();
  const { viewer } = context;

  useEffect(() => {
    if (!viewer) return;

    if (currentStyle === "primary") {
      console.debug("HOOK: useSceneStyleToggle currentStyle primary");
      setupPrimaryStyle(context);
      dispatch(setShowPrimaryTileset(true));
      dispatch(setShowSecondaryTileset(false));
    } else {
      console.debug("HOOK: useSceneStyleToggle currentStyle secondary");
      setupSecondaryStyle(context);
      dispatch(setShowPrimaryTileset(false));
      dispatch(setShowSecondaryTileset(true));
    }
  }, [dispatch, viewer, currentStyle, context]);

  const toggleSceneStyle = useCallback(
    (style?: "primary" | "secondary") => {
      if (style) {
        console.debug("HOOK: useSceneStyleToggle toggleSceneStyle style", style);
        setCurrentStyle(style);
      } else {
        console.debug("HOOK: useSceneStyleToggle toggleSceneStyle no style");
        setCurrentStyle((prev) =>
          prev === "primary" ? "secondary" : "primary",
        );
      }
    },
    [setCurrentStyle],
  );

  return toggleSceneStyle;
};

export default useSceneStyleToggle;
