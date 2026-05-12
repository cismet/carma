import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import type { AppSearchParamsCustomStateSnapshot } from "@carma-appframeworks/portals";
import { useHashState } from "@carma-providers/hash-state";

import {
  buildGeoportalMeasurementModeHashUpdate,
  type GeoportalCustomHashState,
} from "../helper/geoportal-custom-hash-state";
import { getUIMode, setUIMode, UIMode } from "../store/slices/ui";

type UseGeoportalMeasurementModeHashOptions = {
  customHashState:
    | AppSearchParamsCustomStateSnapshot<GeoportalCustomHashState>
    | null;
  writeMeasurementModeHash?: boolean;
};

export const useGeoportalMeasurementModeHash = ({
  customHashState,
  writeMeasurementModeHash = true,
}: UseGeoportalMeasurementModeHashOptions) => {
  const dispatch = useDispatch();
  const uiMode = useSelector(getUIMode);
  const { updateHashState } = useHashState();
  const pendingMeasurementModeHashRef = useRef(false);
  const handledHashStateVersionRef = useRef<number | null>(null);
  const uiModeRef = useRef(uiMode);

  const measurementModeRequested =
    customHashState?.measurementModeRequested ?? false;
  const hashStateSource = customHashState?.source;
  const hashStateVersion = customHashState?.version;

  uiModeRef.current = uiMode;

  useEffect(() => {
    if (hashStateVersion === undefined) {
      return;
    }

    if (handledHashStateVersionRef.current === hashStateVersion) {
      return;
    }

    handledHashStateVersionRef.current = hashStateVersion;

    if (measurementModeRequested) {
      pendingMeasurementModeHashRef.current = true;

      if (uiModeRef.current !== UIMode.MEASUREMENT) {
        dispatch(setUIMode(UIMode.MEASUREMENT));
      }
      return;
    }

    pendingMeasurementModeHashRef.current = false;

    if (
      hashStateSource === "popstate" &&
      uiModeRef.current === UIMode.MEASUREMENT
    ) {
      dispatch(setUIMode(UIMode.DEFAULT));
    }
  }, [dispatch, hashStateSource, hashStateVersion, measurementModeRequested]);

  useEffect(() => {
    if (hashStateVersion === undefined) {
      return;
    }

    if (pendingMeasurementModeHashRef.current) {
      if (uiMode !== UIMode.MEASUREMENT) {
        return;
      }
      pendingMeasurementModeHashRef.current = false;

      if (!writeMeasurementModeHash) {
        return;
      }
    }

    if (
      hashStateSource === "popstate" &&
      !measurementModeRequested &&
      uiMode === UIMode.MEASUREMENT
    ) {
      return;
    }

    updateHashState(
      buildGeoportalMeasurementModeHashUpdate(
        writeMeasurementModeHash && uiMode === UIMode.MEASUREMENT
      ),
      { label: "geoportal:sync-measurement-mode", replace: true }
    );
  }, [
    hashStateSource,
    hashStateVersion,
    measurementModeRequested,
    uiMode,
    updateHashState,
    writeMeasurementModeHash,
  ]);
};
