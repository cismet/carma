import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { useHashLaunchMode } from "@carma-appframeworks/portals";
import {
  getHashParams,
  HASH_LAUNCH_MODE,
  resolveHashLaunchMode,
  updateHashHistoryState,
} from "@carma-commons/utils";

import { URL_PARAM_KEYS } from "../config/app.config";
import {
  buildDefaultLeafletViewHashParams,
  hasCompleteLeafletViewHash,
} from "../config/view.config";
import { useMapStyle } from "./useGeoportalMapStyle";
import { MapStyleKeys } from "../constants/MapStyleKeys";

export const useAppSearchParams = () => {
  const { pathname } = useLocation();
  const { setCurrentStyle } = useMapStyle();

  // Shared: resolve launch mode, set framework, clean up flags
  useHashLaunchMode({ defaultMode: HASH_LAUNCH_MODE.TWO_D });

  useEffect(() => {
    const hashParams = getHashParams();
    const launchMode = resolveHashLaunchMode(hashParams, {
      defaultMode: HASH_LAUNCH_MODE.TWO_D,
    });

    if (
      !hasCompleteLeafletViewHash(hashParams) &&
      launchMode !== HASH_LAUNCH_MODE.THREE_D
    ) {
      updateHashHistoryState(buildDefaultLeafletViewHashParams(), pathname, {
        label: "geoportal:init:default-2d-view",
        replace: true,
      });
    }

    if (hashParams[URL_PARAM_KEYS.mapStyle] !== undefined) {
      const mapStyleParam = hashParams[URL_PARAM_KEYS.mapStyle];
      const isPrimaryStyle = mapStyleParam === "1";
      setCurrentStyle(isPrimaryStyle ? MapStyleKeys.AERIAL : MapStyleKeys.TOPO);
    }
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, setCurrentStyle]);
};
