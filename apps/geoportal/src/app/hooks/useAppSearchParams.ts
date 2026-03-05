import { useEffect } from "react";

import {
  MEASUREMENT_MODE,
  useMapMeasurementsContext,
} from "@carma-commons/measurements";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useHashState } from "@carma-providers/hash-state";

import { URL_PARAM_KEYS } from "../config/app.config";
import { useMapStyle } from "./useGeoportalMapStyle";
import { MapStyleKeys } from "../constants/MapStyleKeys";

export const useAppSearchParams = () => {
  const mapMeasurements = useMapMeasurementsContext();
  const { setActiveFrameworkCesium, setActiveFrameworkLeaflet } =
    useMapFrameworkSwitcherContext();
  const { setCurrentStyle } = useMapStyle();
  const { getHashValues } = useHashState();

  const isTruthyHashValue = (value: unknown) =>
    value === "1" || value === "true" || value === 1 || value === true;

  useEffect(() => {
    const hashValues = getHashValues();
    console.debug("useAppSearchParams - hashParams:", hashValues);

    const measurements3d = hashValues[URL_PARAM_KEYS.measurements3d];
    if (isTruthyHashValue(measurements3d)) {
      mapMeasurements.setMode(MEASUREMENT_MODE.MEASUREMENT);
    }

    // Handle 3D mode parameter
    const is3dValue = hashValues.isCesium ?? hashValues[URL_PARAM_KEYS.is3d];
    if (is3dValue !== undefined) {
      const is3d = is3dValue;
      console.log("[useAppSearchParams] is3d parameter present:", is3d);
      if (isTruthyHashValue(is3d)) {
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

    const mapStyleValue =
      hashValues.mapStyle ?? hashValues[URL_PARAM_KEYS.mapStyle];
    if (mapStyleValue !== undefined) {
      const mapStyleParam = mapStyleValue;
      console.debug("useAppSearchParams - mapStyle param:", mapStyleParam);
      // For backward compatibility with cesium engine: "1" = primary (aerial/mesh), "0" = secondary (topo/lod)
      const isPrimaryStyle = mapStyleParam === MapStyleKeys.AERIAL;

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
