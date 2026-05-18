import { HASH_LAUNCH_MODE } from "@carma-commons/utils";
import { parseFiniteNumber } from "@carma-commons/math";
import type { UseAppSearchParamsOptions } from "@carma-appframeworks/portals";

import {
  type GeoportalCustomHashState,
  resolveGeoportalCustomHashState,
} from "../helper/geoportal-custom-hash-state";
import { DEFAULT_INITIAL_2D_VIEW_REF } from "./view.config";

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

export const resolveGeoportalAppLaunchMode = (
  hashParams: Record<string, unknown>
) => resolveGeoportalCustomHashState(hashParams).launchMode;

export const geoportalAppSearchParamsOptions: UseAppSearchParamsOptions<GeoportalCustomHashState> =
  {
    defaultHashParams: {
      buildParams: buildDefaultLeafletViewHashParams,
      label: "geoportal:init:default-2d-view",
      shouldApply: ({ hashParams, launchMode }) =>
        !hasCompleteLeafletViewHash(hashParams) &&
        launchMode !== HASH_LAUNCH_MODE.THREE_D,
    },
    customHashState: {
      resolve: resolveGeoportalCustomHashState,
    },
    resolveLaunchMode: resolveGeoportalAppLaunchMode,
  };
