import { useEffect } from "react";
import { useDispatch } from "react-redux";

import { setIsMode2d, VIEWERSTATE_KEYS } from "@carma-mapping/cesium-engine";
import { getHashParams } from "@carma-commons/utils";

import { useMapStyle } from "./useGeoportalMapStyle";
import { MapStyleKeys } from "../constants/MapStyleKeys";

export const useAppSearchParams = () => {
  const dispatch = useDispatch();
  const { setCurrentStyle } = useMapStyle();

  useEffect(() => {
    const hashParams = getHashParams();
    console.debug("useAppSearchParams - hashParams:", hashParams);

    // Handle 3D mode parameter
    if (hashParams[VIEWERSTATE_KEYS.is3d] !== undefined) {
      const is3d = hashParams[VIEWERSTATE_KEYS.is3d];
      if (is3d === "1") {
        dispatch(setIsMode2d(false));
      }
    } else {
      dispatch(setIsMode2d(true));
    }

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
