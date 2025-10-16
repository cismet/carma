import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  selectCurrentSceneStyle,
  selectSceneStylePrimary,
  selectSceneStyleSecondary,
  setCurrentSceneStyle,
  setShowPrimaryTileset,
  setShowSecondaryTileset,
} from "../slices/cesium";
import { setupPrimaryStyle, setupSecondaryStyle } from "../utils/sceneStyles";

import { useCesiumViewer } from "./useCesiumViewer";
import { useCesiumContext } from "./useCesiumContext";
import { SceneStyles } from "../..";

export const useSceneStyles = (initialStyle?: keyof SceneStyles) => {
  const dispatch = useDispatch();
  const currentSceneStyle = useSelector(selectCurrentSceneStyle);

  const ctx = useCesiumContext();
  const viewer = useCesiumViewer();
  const primaryStyle = useSelector(selectSceneStylePrimary);
  const secondaryStyle = useSelector(selectSceneStyleSecondary);

  useEffect(() => {
    if (!viewer || currentSceneStyle === undefined) return;
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
  }, [dispatch, viewer, currentSceneStyle, primaryStyle, secondaryStyle, ctx]);

  useEffect(() => {
    if (currentSceneStyle === undefined && initialStyle) {
      dispatch(setCurrentSceneStyle(initialStyle));
    }
  }, [dispatch, currentSceneStyle, initialStyle]);
};

export default useSceneStyles;
