import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useHashState, type HashParams } from "@carma-providers/hash-state";
import {
  HASH_LAUNCH_MODE,
  isTruthyHashValue,
  resolveHashLaunchMode,
} from "@carma-commons/utils";

import { URL_PARAM_KEYS } from "../config/app.config";
import { getUIMode, setUIMode, UIMode } from "../store/slices/ui";

const shouldEnable3dMeasurementModeFromHash = (hashParams: HashParams) => {
  const launchMode = resolveHashLaunchMode(hashParams, {
    defaultMode: HASH_LAUNCH_MODE.TWO_D,
  });

  return (
    launchMode === HASH_LAUNCH_MODE.THREE_D &&
    isTruthyHashValue(hashParams[URL_PARAM_KEYS.measurements3d])
  );
};

export const useGeoportalMeasurementModeHash = () => {
  const dispatch = useDispatch();
  const uiMode = useSelector(getUIMode);
  const { isCesium } = useMapFrameworkSwitcherContext();
  const { getHashParams, registerOnPopState, updateHashState } =
    useHashState();
  const pendingMeasurementModeHashRef = useRef(false);
  const uiModeRef = useRef(uiMode);
  const [initialHashApplied, setInitialHashApplied] = useState(false);

  uiModeRef.current = uiMode;

  const syncMeasurementModeFromHash = useCallback(
    (
      hashParams: HashParams,
      { allowDisable }: { allowDisable: boolean }
    ) => {
      const shouldEnableMeasurements =
        shouldEnable3dMeasurementModeFromHash(hashParams);

      if (shouldEnableMeasurements) {
        pendingMeasurementModeHashRef.current = true;

        if (uiModeRef.current !== UIMode.MEASUREMENT) {
          dispatch(setUIMode(UIMode.MEASUREMENT));
        }
        return;
      }

      pendingMeasurementModeHashRef.current = false;

      if (allowDisable && uiModeRef.current === UIMode.MEASUREMENT) {
        dispatch(setUIMode(UIMode.DEFAULT));
      }
    },
    [dispatch]
  );

  useEffect(() => {
    if (initialHashApplied) {
      return;
    }

    syncMeasurementModeFromHash(getHashParams(), { allowDisable: false });

    setInitialHashApplied(true);
  }, [
    getHashParams,
    initialHashApplied,
    syncMeasurementModeFromHash,
  ]);

  useEffect(
    () =>
      registerOnPopState(({ hashParams }) => {
        syncMeasurementModeFromHash(hashParams, { allowDisable: true });
      }),
    [registerOnPopState, syncMeasurementModeFromHash]
  );

  useEffect(() => {
    if (!initialHashApplied) {
      return;
    }

    if (pendingMeasurementModeHashRef.current) {
      if (!isCesium || uiMode !== UIMode.MEASUREMENT) {
        return;
      }
      pendingMeasurementModeHashRef.current = false;
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
