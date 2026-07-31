import { useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";

import { useAppSearchParams } from "@carma-appframeworks/portals";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useHashState } from "@carma-providers/hash-state";

import {
  buildGeoportalMeasurementModeHashUpdate,
} from "../helper/geoportal-custom-hash-state";
import {
  geoportalAppSearchParamsOptions,
  geoportalAppSearchParamsOptionsWithoutDefaultView,
} from "../config/app-search-params";
import { findFachzwillingByPathname } from "../constants/fachzwillinge";
import { getUIMode, UIMode } from "../store/slices/ui";

export const useGeoportalAppSearchParams = () => {
  const uiMode = useSelector(getUIMode);
  const { updateHashState } = useHashState();
  const { pathname } = useLocation();
  // resolved from the route rather than from the store: the default-view write
  // below runs on mount, before the store flag is dispatched from RoutedApp
  const disableHashWrite = useMemo(
    () => findFachzwillingByPathname(pathname)?.disableHashWrite ?? false,
    [pathname]
  );
  useAppSearchParams(
    disableHashWrite
      ? geoportalAppSearchParamsOptionsWithoutDefaultView
      : geoportalAppSearchParamsOptions
  );
  const { isCesium } = useMapFrameworkSwitcherContext();

  useEffect(() => {
    if (!isCesium) {
      return;
    }

    updateHashState(
      buildGeoportalMeasurementModeHashUpdate(uiMode === UIMode.MEASUREMENT),
      { label: "geoportal:sync-measurement-mode", replace: true }
    );
  }, [isCesium, uiMode, updateHashState]);
};
