import { useMemo } from "react";
import { useHashState } from "@carma-providers/hash-state";
import {
  HASH_FOV_CONVENTION,
  type HashFovConvention,
  type HashZoomConvention,
  readViewStateFromHashValues,
  type ViewState,
} from "@carma-mapping/engines-interop/view-sync";

export type UseInitialSceneViewStateOptions = {
  defaultFovDeg?: number;
  maxPitchDeg?: number;
  zoomConvention?: HashZoomConvention;
  fovConvention?: HashFovConvention;
};

export const useInitialSceneViewState = (
  options: UseInitialSceneViewStateOptions = {}
): {
  initialViewState: ViewState | null;
  isResolved: boolean;
} => {
  const { getHashValues } = useHashState();

  return useMemo(() => {
    const hashValues = getHashValues();
    return {
      initialViewState: readViewStateFromHashValues(hashValues, {
        ...(Number.isFinite(options.defaultFovDeg)
          ? { defaultFovDeg: options.defaultFovDeg }
          : {}),
        ...(Number.isFinite(options.maxPitchDeg)
          ? { maxPitchDeg: options.maxPitchDeg }
          : {}),
        ...(options.zoomConvention
          ? { zoomConvention: options.zoomConvention }
          : {}),
        fovConvention:
          options.fovConvention ?? HASH_FOV_CONVENTION.CESIUM_LONGER_EDGE,
      }),
      isResolved: true,
    };
  }, [
    getHashValues,
    options.defaultFovDeg,
    options.maxPitchDeg,
    options.fovConvention,
    options.zoomConvention,
  ]);
};
