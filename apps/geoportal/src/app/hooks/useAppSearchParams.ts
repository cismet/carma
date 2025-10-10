import { useCallback, useEffect } from "react";
import { useDispatch } from "react-redux";

import {
  MapStyleKeys,
  useInitialViewModeFromUrl,
} from "@carma-appframeworks/portals";
import { VIEWERSTATE_KEYS } from "@carma-mapping/engines/cesium";
import { getHashParams } from "@carma-commons/utils";
import { setUIIsMode2d } from "../store/slices/ui";

import { useMapStyle } from "./useGeoportalMapStyle";

export const useAppSearchParams = () => {
  const dispatch = useDispatch();
  const { setCurrentStyle } = useMapStyle();

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

  // Initialize map style from URL
  useEffect(() => {
    const hashParams = getHashParams();
    console.debug("useAppSearchParams - hashParams:", hashParams);

    if (hashParams[VIEWERSTATE_KEYS.mapStyle] !== undefined) {
      const mapStyleParam = hashParams[VIEWERSTATE_KEYS.mapStyle];
      console.debug("useAppSearchParams - mapStyle param:", mapStyleParam);
      // For backward compatibility with cesium engine: "1" = primary (aerial/mesh), "0" = secondary (topo/lod)
      const isPrimaryStyle = mapStyleParam === "1";

      // Map URL parameter to actual map style keys:
      // "1" (primary) = aerial/mesh view = AERIAL
      // "0" (secondary) = topo/lod view = TOPO
      if (isPrimaryStyle) {
        console.debug("useAppSearchParams - setting style to AERIAL");
        setCurrentStyle(MapStyleKeys.AERIAL);
      } else {
        console.debug("useAppSearchParams - setting style to TOPO");
        setCurrentStyle(MapStyleKeys.TOPO);
      }
    }
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
