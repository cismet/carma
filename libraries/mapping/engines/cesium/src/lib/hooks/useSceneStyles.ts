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

import { useCesiumViewer } from "./useCesiumViewer";
import { useCesiumContext } from "./useCesiumContext";

export const useSceneStyles = (enabled = true) => {
  const dispatch = useDispatch();
  const currentSceneStyle = useSelector(selectCurrentSceneStyle);

  const ctx = useCesiumContext();
  const viewer = useCesiumViewer();
  const primaryStyle = useSelector(selectSceneStylePrimary);
  const secondaryStyle = useSelector(selectSceneStyleSecondary);

  useEffect(() => {
    if (!enabled || !viewer || currentSceneStyle === undefined) return;
    console.debug("currentSceneStyle change", currentSceneStyle);
    if (currentSceneStyle === "primary") {
      setupPrimaryStyle(ctx, primaryStyle);
      dispatch(setShowPrimaryTileset(true));
      dispatch(setShowSecondaryTileset(false));
    } else if (currentSceneStyle === "secondary") {
      setupSecondaryStyle(ctx, secondaryStyle);
      dispatch(setShowPrimaryTileset(false));
      dispatch(setShowSecondaryTileset(true));
    } else {
      throw new Error(`Unknown style: ${currentSceneStyle}`);
    }
  }, [
    dispatch,
    enabled,
    viewer,
    currentSceneStyle,
    primaryStyle,
    secondaryStyle,
    ctx,
  ]);
};

export default useSceneStyles;
