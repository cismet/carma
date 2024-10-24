import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";

import { SceneStyles } from "../..";
import {
  setShowPrimaryTileset,
  setShowSecondaryTileset,
} from "../slices/cesium";
import { setupPrimaryStyle, setupSecondaryStyle } from "../utils/sceneStyles";

import { useCesiumViewer } from "./useCesiumViewer";
import { useCesiumContext } from './useCesiumContext';

export const useSceneStyleToggle = (
  initialStyle: keyof SceneStyles = "secondary"
) => {
  const dispatch = useDispatch();
  const [currentStyle, setCurrentStyle] =
    useState<keyof SceneStyles>(initialStyle);
  const ctx = useCesiumContext();
  const viewer = useCesiumViewer();

  useEffect(() => {
    if (!viewer) return;

    if (currentStyle === "primary") {
      setupPrimaryStyle(ctx);
      dispatch(setShowPrimaryTileset(true));
      dispatch(setShowSecondaryTileset(false));
    } else {
      setupSecondaryStyle(ctx);
      dispatch(setShowPrimaryTileset(false));
      dispatch(setShowSecondaryTileset(true));
    }
  }, [dispatch, viewer, currentStyle, ctx]);

  const toggleSceneStyle = (style?: "primary" | "secondary") => {
    if (style) {
      setCurrentStyle(style);
    } else {
      setCurrentStyle((prev) => (prev === "primary" ? "secondary" : "primary"));
    }
  };

  return toggleSceneStyle;
};

export default useSceneStyleToggle;
