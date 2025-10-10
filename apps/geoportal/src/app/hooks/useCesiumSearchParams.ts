import { useCallback, useEffect } from "react";
import { useDispatch } from "react-redux";

import {
  ManagedCesiumStyleKeys,
  useInitialViewModeFromUrl,
} from "@carma-appframeworks/portals";
import {
  useCesiumContext,
  CtxEvent,
  VIEWERSTATE_KEYS,
} from "@carma-mapping/engines/cesium";
import { getHashParams } from "@carma-commons/utils";
import { setUIIsMode2d } from "../store/slices/ui";

// TODO move this out of cesium there should only be an adapter to transform cesium camera to canonical degree numeric values somewhere
export const useCesiumSearchParams = () => {
  const dispatch = useDispatch();
  const { emit } = useCesiumContext();

  // Initialize 2D/3D mode from URL
  const setUIMode = useCallback(
    (isMode2d: boolean) => {
      dispatch(setUIIsMode2d(isMode2d));
    },
    [dispatch]
  );

  useInitialViewModeFromUrl({
    is3dKey: VIEWERSTATE_KEYS.is3d,
    is3dEnabledValue: "1",
    setUIMode,
  });

  // Initialize scene style from URL
  useEffect(() => {
    const hashParams = getHashParams();
    // TODO: handle this in common hook with TopicMap basemap setting on start from URL
    if (hashParams[VIEWERSTATE_KEYS.mapStyle] !== undefined) {
      const isPrimaryStyle = hashParams[VIEWERSTATE_KEYS.mapStyle] === "1";
      emit(
        CtxEvent.SetSceneStyle,
        isPrimaryStyle
          ? ManagedCesiumStyleKeys.MESH
          : ManagedCesiumStyleKeys.LOD2
      );
    }
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
