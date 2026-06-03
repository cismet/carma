import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import { useAppSearchParams } from "@carma-appframeworks/portals";
import { HASH_LAUNCH_MODE } from "@carma-commons/utils";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useCesiumContext } from "@carma-mapping/engines/cesium/legacy";
import { useHashState } from "@carma-providers/hash-state";

import {
  buildGeoportalMeasurementModeHashUpdate,
} from "../helper/geoportal-custom-hash-state";
import { geoportalAppSearchParamsOptions } from "../config/app-search-params";
import { getUIMode, setUIMode, UIMode } from "../store/slices/ui";

export const useGeoportalMeasurementModeHash = () => {
  const dispatch = useDispatch();
  const uiMode = useSelector(getUIMode);
  const { updateHashState } = useHashState();
  const { customHashState } = useAppSearchParams(geoportalAppSearchParamsOptions);
  const { isCesium } = useMapFrameworkSwitcherContext();
  const { initialViewApplied } = useCesiumContext();
  const appliedMeasurementRequestVersionRef = useRef<number | null>(null);
  const enabled = isCesium && initialViewApplied;

  const measurementModeRequested = Boolean(
    customHashState?.measurementModeRequested &&
      customHashState.launchMode === HASH_LAUNCH_MODE.THREE_D
  );
  const hashStateSource = customHashState?.source;
  const hashStateVersion = customHashState?.version;

  useEffect(() => {
    if (hashStateVersion === undefined || !enabled) {
      return;
    }

    if (
      measurementModeRequested &&
      appliedMeasurementRequestVersionRef.current !== hashStateVersion
    ) {
      if (uiMode !== UIMode.MEASUREMENT) {
        dispatch(setUIMode(UIMode.MEASUREMENT));
        return;
      }

      appliedMeasurementRequestVersionRef.current = hashStateVersion;
    } else if (!measurementModeRequested) {
      appliedMeasurementRequestVersionRef.current = null;
    }

    if (
      hashStateSource === "popstate" &&
      !measurementModeRequested &&
      uiMode === UIMode.MEASUREMENT
    ) {
      dispatch(setUIMode(UIMode.DEFAULT));
      return;
    }

    const measurementModeActive = uiMode === UIMode.MEASUREMENT;
    if (measurementModeActive === measurementModeRequested) {
      return;
    }

    updateHashState(
      buildGeoportalMeasurementModeHashUpdate(measurementModeActive),
      { label: "geoportal:sync-measurement-mode", replace: true }
    );
  }, [
    dispatch,
    enabled,
    hashStateSource,
    hashStateVersion,
    measurementModeRequested,
    uiMode,
    updateHashState,
  ]);
};
