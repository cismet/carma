import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { useHashLaunchMode } from "@carma-appframeworks/portals";
import {
  getHashParams,
  HASH_LAUNCH_MODE,
  resolveHashLaunchMode,
  updateHashHistoryState,
} from "@carma-commons/utils";

import { DEFAULT_INITIAL_2D_VIEW_REF } from "../config/view.config";

const parseFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const hasCompleteLeafletViewHash = (
  hashParams: Record<string, unknown>
): boolean => {
  return (
    parseFiniteNumber(hashParams.lat) !== undefined &&
    parseFiniteNumber(hashParams.lng) !== undefined &&
    parseFiniteNumber(hashParams.zoom) !== undefined
  );
};

const buildDefaultLeafletViewHashParams = (): Record<string, string> => ({
  lat: String(DEFAULT_INITIAL_2D_VIEW_REF.latDeg),
  lng: String(DEFAULT_INITIAL_2D_VIEW_REF.lngDeg),
  zoom: String(DEFAULT_INITIAL_2D_VIEW_REF.zoomLeaflet256),
});

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
