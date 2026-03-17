import { useEffect } from "react";

import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { getHashParams } from "@carma-commons/utils";

import { URL_PARAM_KEYS } from "../config/app.config";
import { useMapStyle } from "./useGeoportalMapStyle";
import { MapStyleKeys } from "../constants/MapStyleKeys";

export const useAppSearchParams = () => {
  const { setActiveFrameworkCesium, setActiveFrameworkLeaflet } =
    useMapFrameworkSwitcherContext();
  const { setCurrentStyle } = useMapStyle();

  useEffect(() => {
    const hashParams = getHashParams();
    console.debug("useAppSearchParams - hashParams:", hashParams);

    const has3dHeightHint =
      hashParams.h !== undefined || hashParams.altitude !== undefined;

    if (has3dHeightHint) {
      console.log(
        "[useAppSearchParams] Height hash detected; setting framework to cesium (3D)"
      );
      setActiveFrameworkCesium();
    } else {
      console.log(
        "[useAppSearchParams] No 3D height hint present, setting framework to leaflet (LeafletLike)"
      );
      setActiveFrameworkLeaflet();
    }

    if (hashParams[URL_PARAM_KEYS.mapStyle] !== undefined) {
      const mapStyleParam = hashParams[URL_PARAM_KEYS.mapStyle];
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
