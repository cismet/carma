import { useCallback, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "react-router-dom";

import { useAppSearchParams } from "@carma-appframeworks/portals";
import {
  buildHashLaunchModeParams,
  HASH_LAUNCH_MODE,
} from "@carma-commons/utils";
import {
  SCENE_VIEW_STATE_TWO_D_UNSUPPORTED_HASH_PARAMS,
  useHashState,
} from "@carma-providers/hash-state";

import { buildGeoportalMeasurementModeHashUpdate } from "../helper/geoportal-custom-hash-state";
import {
  geoportalAppSearchParamsOptions,
  geoportalAppSearchParamsOptionsWithoutDefaultView,
} from "../config/app-search-params";
import { findFachzwillingByPathname } from "../constants/fachzwillinge";
import {
  getLibre3d,
  getUIMode,
  setLibre3d,
  setLibre3dTransition,
  UIMode,
} from "../store/slices/ui";
import { useCesiumEnabled } from "./useCesiumEnabled";
import { useIs3dView } from "./useIs3dView";
import { useGeoportalShadowSimulationHash } from "./use-geoportal-shadow-simulation-hash";

export const useGeoportalAppSearchParams = () => {
  const dispatch = useDispatch();
  const uiMode = useSelector(getUIMode);
  const libre3d = useSelector(getLibre3d);
  const cesiumEnabled = useCesiumEnabled();
  const is3dView = useIs3dView();
  const { updateHashState } = useHashState();
  const { pathname } = useLocation();
  // resolved from the route rather than from the store: the default-view write
  // below runs on mount, before the store flag is dispatched from RoutedApp
  const fachzwilling = useMemo(
    () => findFachzwillingByPathname(pathname),
    [pathname]
  );
  const disableHashWrite = fachzwilling?.disableHashWrite ?? false;
  // a 3D link (`h`, `3d`, `is3d`, `mm`) opens the maplibre 3D view; its
  // lat/lng/zoom/p/b are what the maplibre map starts with anyway
  const enterLibre3d = useCallback(() => {
    dispatch(setLibre3dTransition(true));
    dispatch(setLibre3d(true));
  }, [dispatch]);
  const { customHashState } = useAppSearchParams({
    ...(disableHashWrite
      ? geoportalAppSearchParamsOptionsWithoutDefaultView
      : geoportalAppSearchParamsOptions),
    onLaunch3d: cesiumEnabled ? undefined : enterLibre3d,
  });
  useGeoportalShadowSimulationHash({
    customHashState,
  });

  useEffect(() => {
    if (cesiumEnabled) {
      return;
    }
    // `3d` marks the maplibre 3D view (the map's own writes keep it, see
    // `hashKeepLaunchFlag3d`); the Cesium-only keys of a 3D link go
    updateHashState(
      buildHashLaunchModeParams(
        libre3d ? HASH_LAUNCH_MODE.THREE_D : HASH_LAUNCH_MODE.UNSET
      ),
      {
        clearStateKeys: SCENE_VIEW_STATE_TWO_D_UNSUPPORTED_HASH_PARAMS,
        label: "geoportal:sync-libre-3d",
        replace: true,
      }
    );
  }, [cesiumEnabled, libre3d, updateHashState]);

  useEffect(() => {
    if (!is3dView) {
      return;
    }

    updateHashState(
      buildGeoportalMeasurementModeHashUpdate(uiMode === UIMode.MEASUREMENT),
      { label: "geoportal:sync-measurement-mode", replace: true }
    );
  }, [is3dView, uiMode, updateHashState]);
};
