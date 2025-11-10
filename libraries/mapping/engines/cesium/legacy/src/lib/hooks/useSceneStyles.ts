import { startTransition, useEffect } from "react";
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

import { useCesiumContext } from "./useCesiumContext";

export const useSceneStyles = (enabled = true) => {
  const dispatch = useDispatch();
  const currentSceneStyle = useSelector(selectCurrentSceneStyle);

  const ctx = useCesiumContext();
  const primaryStyle = useSelector(selectSceneStylePrimary);
  const secondaryStyle = useSelector(selectSceneStyleSecondary);

  useEffect(() => {
    // Wait for viewer to be fully ready (including imageryLayers collection)
    if (
      !enabled ||
      !ctx.isValidViewer() ||
      !ctx.isViewerReady ||
      currentSceneStyle === undefined
    )
      return;
    console.debug("currentSceneStyle change", currentSceneStyle);
    if (currentSceneStyle === "primary" && primaryStyle) {
      setupPrimaryStyle(ctx, primaryStyle);
      // Non-urgent Redux state updates - separate from WebGL work
      startTransition(() => {
        dispatch(setShowPrimaryTileset(true));
        dispatch(setShowSecondaryTileset(false));
      });
      setCesiumBackgroundCssVar(primaryStyle.backgroundColor);
    } else if (currentSceneStyle === "secondary" && secondaryStyle) {
      setupSecondaryStyle(ctx, secondaryStyle);
      // Non-urgent Redux state updates - separate from WebGL work
      startTransition(() => {
        dispatch(setShowPrimaryTileset(false));
        dispatch(setShowSecondaryTileset(true));
      });
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
    ctx,
    ctx.isViewerReady,
  ]);
};

export default useSceneStyles;
