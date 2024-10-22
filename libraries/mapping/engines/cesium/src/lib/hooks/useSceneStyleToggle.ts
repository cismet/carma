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

  console.debug("HOOK: scene Style Toggle currentStyle", currentStyle);

  useEffect(() => {
    if (!viewer) return;

    if (currentStyle === "primary") {
      setupPrimaryStyle(context);
      dispatch(setShowPrimaryTileset(true));
      dispatch(setShowSecondaryTileset(false));
    } else {
      setupSecondaryStyle(context);
      dispatch(setShowPrimaryTileset(false));
      dispatch(setShowSecondaryTileset(true));
    }
  }, [dispatch, viewer, currentStyle, context]);

  const toggleSceneStyle = useCallback(
    (style?: "primary" | "secondary") => {
      if (style) {
        setCurrentStyle(style);
      } else {
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
