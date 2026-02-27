import { useEffect } from "react";

import {
  MEASUREMENT_MODE,
  useAnnotationContext,
} from "@carma-mapping/annotations/core";
import { useHashState } from "@carma-providers/hash-state";

import { URL_PARAM_KEYS } from "../config/app.config";

export const useMeasurementHashSync = () => {
  const mapMeasurements = useAnnotationContext();
  const { updateHash } = useHashState();

  useEffect(() => {
    const shouldEnableMeasurements =
      mapMeasurements.mode === MEASUREMENT_MODE.MEASUREMENT;
    updateHash(
      {
        [URL_PARAM_KEYS.measurements3d]: shouldEnableMeasurements
          ? "1"
          : undefined,
      },
      { label: "sync measurement mode", replace: true }
    );
  }, [mapMeasurements.mode, updateHash]);
};
