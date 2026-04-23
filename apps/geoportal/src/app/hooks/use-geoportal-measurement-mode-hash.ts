import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useHashState } from "@carma-providers/hash-state";
import {
  HASH_LAUNCH_MODE,
  isTruthyHashValue,
  resolveHashLaunchMode,
} from "@carma-commons/utils";

import { URL_PARAM_KEYS } from "../config/app.config";
import { getUIMode, setUIMode, UIMode } from "../store/slices/ui";

export const useGeoportalMeasurementModeHash = () => {
  const dispatch = useDispatch();
  const uiMode = useSelector(getUIMode);
  const { isCesium } = useMapFrameworkSwitcherContext();
  const { getHashParams, updateHashState } = useHashState();
  const pendingInitialMeasurementModeRef = useRef(false);
  const [initialHashApplied, setInitialHashApplied] = useState(false);

  useEffect(() => {
    if (initialHashApplied) {
      return;
    }

    const hashParams = getHashParams();
    const launchMode = resolveHashLaunchMode(hashParams, {
      defaultMode: HASH_LAUNCH_MODE.TWO_D,
    });
    const shouldEnableMeasurements =
      launchMode === HASH_LAUNCH_MODE.THREE_D &&
      isTruthyHashValue(hashParams[URL_PARAM_KEYS.measurements3d]);

    if (shouldEnableMeasurements) {
      pendingInitialMeasurementModeRef.current = true;
      dispatch(setUIMode(UIMode.MEASUREMENT));
    }

    setInitialHashApplied(true);
  }, [dispatch, getHashParams, initialHashApplied]);

  useEffect(() => {
    if (!initialHashApplied) {
      return;
    }

    if (pendingInitialMeasurementModeRef.current) {
      if (!isCesium || uiMode !== UIMode.MEASUREMENT) {
        return;
      }
      pendingInitialMeasurementModeRef.current = false;
    }

    updateHashState(
      {
        [URL_PARAM_KEYS.measurements3d]:
          isCesium && uiMode === UIMode.MEASUREMENT ? "1" : undefined,
      },
      { label: "geoportal:sync-3d-measurement-mode", replace: true }
    );
  }, [initialHashApplied, isCesium, uiMode, updateHashState]);
};
