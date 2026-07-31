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

export const geoportalAppSearchParamsOptions = {
  defaultHashParams: {
    buildParams: buildDefaultLeafletViewHashParams,
    label: "geoportal:init:default-2d-view",
    shouldApply: ({ hashParams, launchMode }) =>
      !hasCompleteLeafletViewHash(hashParams) &&
      launchMode !== HASH_LAUNCH_MODE.THREE_D,
  },
  resolveCustomHashState: resolveGeoportalCustomHashState,
} satisfies UseAppSearchParamsOptions<GeoportalCustomHashState>;

/**
 * For routes whose view is driven externally ({@link FachzwillingRoute.disableHashWrite}):
 * same options without the initial default-view write, which would otherwise put
 * a lat/lng/zoom into the hash on every load and seed the next reload with it.
 */
export const geoportalAppSearchParamsOptionsWithoutDefaultView = {
  resolveCustomHashState: resolveGeoportalCustomHashState,
} satisfies UseAppSearchParamsOptions<GeoportalCustomHashState>;
