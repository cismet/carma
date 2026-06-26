import { useContext, useEffect, useRef } from "react";

import {
  EnviroMetricMapContext,
  EnviroMetricMapDispatchContext,
} from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMapContextProvider";

import { isNumberArrayEqual } from "@carma-commons/utils";

import { getWebMercatorInWGS84 } from "../../utils/geo";

/** Restores a feature-info query (qx/qy) carried in the URL on load. The library async-restores `featureInfoModeActivated` from localforage and can clobber the URL's `true`; re-assert the mode within a bounded startup window and auto-fetch the restored value once. */
export const useRestoreFeatureInfoQuery = () => {
  const { controlState } = useContext<typeof EnviroMetricMapContext>(
    EnviroMetricMapContext
  );
  const { executeFeatureInfoRequest, setFeatureInfoModeActivation } =
    useContext<typeof EnviroMetricMapDispatchContext>(
      EnviroMetricMapDispatchContext
    );

  const initialRestoredQueryPositionRef = useRef<[number, number] | null>(
    controlState.currentFeatureInfoPosition ?? null
  );
  const didAutoFetchRestoredQueryRef = useRef(false);
  const urlQueryAuthorityHandledRef = useRef(false);

  // Bound the startup window in which the URL may override the persisted mode.
  useEffect(() => {
    if (!initialRestoredQueryPositionRef.current) return;
    const expiry = window.setTimeout(() => {
      urlQueryAuthorityHandledRef.current = true;
    }, 3000);
    return () => clearTimeout(expiry);
  }, []);

  // Re-assert feature-info mode if the stale localforage value clobbers it.
  useEffect(() => {
    if (
      !initialRestoredQueryPositionRef.current ||
      urlQueryAuthorityHandledRef.current
    ) {
      return;
    }
    if (!controlState.featureInfoModeActivated) {
      urlQueryAuthorityHandledRef.current = true;
      setFeatureInfoModeActivation(true);
    }
  }, [controlState.featureInfoModeActivated, setFeatureInfoModeActivation]);

  // Auto-fetch the restored feature-info value exactly once.
  useEffect(() => {
    const initialRestoredPosition = initialRestoredQueryPositionRef.current;
    if (!initialRestoredPosition || didAutoFetchRestoredQueryRef.current) {
      return;
    }

    const restoredPosition = controlState.currentFeatureInfoPosition;
    if (
      !restoredPosition ||
      !isNumberArrayEqual(restoredPosition, initialRestoredPosition)
    ) {
      return;
    }

    if (controlState.currentFeatureInfoValue !== undefined) {
      didAutoFetchRestoredQueryRef.current = true;
      return;
    }

    didAutoFetchRestoredQueryRef.current = true;

    const { lat, lon } = getWebMercatorInWGS84(restoredPosition);
    executeFeatureInfoRequest({ lat, lng: lon });
  }, [
    controlState.currentFeatureInfoPosition,
    controlState.currentFeatureInfoValue,
    executeFeatureInfoRequest,
  ]);
};
