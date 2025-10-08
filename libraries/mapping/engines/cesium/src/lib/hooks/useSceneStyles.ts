import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  selectCurrentSceneStyle,
  selectSceneStylePrimary,
  selectSceneStyleSecondary,
  setShowPrimaryTileset,
  setShowSecondaryTileset,
} from "../slices/cesium";
import { setupPrimaryStyle, setupSecondaryStyle } from "../utils/sceneStyles";
import { setCesiumBackgroundCssVar } from "../utils/cssVars";
import { isValidScene } from "../utils/instanceGates";
import { useCesiumContext } from "./useCesiumContext";

export const useSceneStyles = (enabled = true) => {
  const dispatch = useDispatch();
  const currentSceneStyle = useSelector(selectCurrentSceneStyle);

  const { sceneRef, withTerrainProvider, isValidViewer, isViewerReady } =
    useCesiumContext();
  const primaryStyle = useSelector(selectSceneStylePrimary);
  const secondaryStyle = useSelector(selectSceneStyleSecondary);

  useEffect(() => {
    const scene = sceneRef.current;

    if (!enabled || !isValidScene(scene) || currentSceneStyle === undefined)
      return;
    console.debug("currentSceneStyle change", currentSceneStyle);
    if (currentSceneStyle === "primary" && primaryStyle) {
      setupPrimaryStyle(scene, withTerrainProvider, primaryStyle);
      dispatch(setShowPrimaryTileset(true));
      dispatch(setShowSecondaryTileset(false));
      setCesiumBackgroundCssVar(primaryStyle.backgroundColor);
    } else if (currentSceneStyle === "secondary" && secondaryStyle) {
      setupSecondaryStyle(scene, withTerrainProvider, secondaryStyle);
      dispatch(setShowPrimaryTileset(false));
      dispatch(setShowSecondaryTileset(true));
      setCesiumBackgroundCssVar(secondaryStyle.backgroundColor);
    } else {
      throw new Error(`Unknown style: ${currentSceneStyle}`);
    }
  }, [
    dispatch,
    enabled,
    currentSceneStyle,
    primaryStyle,
    secondaryStyle,
    sceneRef,
    withTerrainProvider,
    isValidViewer,
    isViewerReady,
  ]);
};

export default useSceneStyles;
