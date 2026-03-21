import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { useHashLaunchMode } from "@carma-appframeworks/portals";
import {
  getHashParams,
  HASH_LAUNCH_MODE,
  resolveHashLaunchMode,
  updateHashHistoryState,
} from "@carma-commons/utils";

import {
  buildDefaultLeafletViewHashParams,
  hasCompleteLeafletViewHash,
} from "../config/view.config";

export const useAppSearchParams = () => {
  const { pathname } = useLocation();

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
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
};
