import { useEffect } from "react";
import { useSelector } from "react-redux";

import { useAppSearchParams } from "@carma-appframeworks/portals";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useHashState } from "@carma-providers/hash-state";

import {
  buildGeoportalMeasurementModeHashUpdate,
} from "../helper/geoportal-custom-hash-state";
import { geoportalAppSearchParamsOptions } from "../config/app-search-params";
import { getUIMode, UIMode } from "../store/slices/ui";

export const useGeoportalAppSearchParams = () => {
  const uiMode = useSelector(getUIMode);
  const { updateHashState } = useHashState();
  useAppSearchParams(geoportalAppSearchParamsOptions);
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
