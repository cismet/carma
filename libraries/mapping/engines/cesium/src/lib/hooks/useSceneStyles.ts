import { useEffect, useState } from "react";
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
import { useTweakpaneCtx } from "@carma-commons/debug";

export const useSceneStyles = (initialStyle?: keyof SceneStyles) => {
  const dispatch = useDispatch();
  const currentSceneStyle = useSelector(selectCurrentSceneStyle);

  const ctx = useCesiumContext();
  const viewer = useCesiumViewer();
  const primaryStyle = useSelector(selectSceneStylePrimary);
  const secondaryStyle = useSelector(selectSceneStyleSecondary);
  const [hq500Visible, setHq500Visible] = useState(true);

  useTweakpaneCtx({
    folder: { title: "HQ500 Vis" },
    params: {
      get hq500Visible() {
        return hq500Visible;
      },
      set hq500Visible(value: boolean) {
        if (value !== hq500Visible) {
          setHq500Visible(value);
        }
      },
    },
    inputs: [
      {name: "hq500Visible",  type: "boolean"},
    ],
  });


  useEffect(() => {
    if (!viewer || currentSceneStyle === undefined) return;
    console.debug("currentSceneStyle change", currentSceneStyle);
    if (currentSceneStyle === "primary") {
      setupPrimaryStyle(ctx, primaryStyle, hq500Visible);
      dispatch(setShowPrimaryTileset(true));
      dispatch(setShowSecondaryTileset(false));
    } else if (currentSceneStyle === "secondary") {
      setupSecondaryStyle(ctx, secondaryStyle);
      dispatch(setShowPrimaryTileset(false));
      dispatch(setShowSecondaryTileset(true));
    } else {
      throw new Error(`Unknown style: ${currentSceneStyle}`);
    }
  }, [dispatch, viewer, currentSceneStyle, primaryStyle, secondaryStyle, ctx, hq500Visible]);

  useEffect(() => {
    if (currentSceneStyle === undefined && initialStyle) {
      dispatch(setCurrentSceneStyle(initialStyle));
    }
  }, [dispatch, currentSceneStyle, initialStyle]);
};

export default useSceneStyles;
