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

    // Handle 3D mode parameter
    if (hashParams[URL_PARAM_KEYS.is3d] !== undefined) {
      const is3d = hashParams[URL_PARAM_KEYS.is3d];
      console.log("[useAppSearchParams] is3d parameter present:", is3d);
      if (is3d === "1") {
        console.log("[useAppSearchParams] Setting framework to cesium (3D)");
        setActiveFrameworkCesium();
      } else {
        console.log(
          "[useAppSearchParams] is3d present but not '1', defaulting to leaflet (LeafletLike)"
        );
        setActiveFrameworkLeaflet();
      }
    } else {
      console.log(
        "[useAppSearchParams] is3d parameter NOT present, setting framework to leaflet (LeafletLike)"
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
