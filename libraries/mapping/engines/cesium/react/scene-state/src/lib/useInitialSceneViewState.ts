import { useMemo } from "react";
import { useHashState } from "@carma-providers/hash-state";
import {
  readViewStateFromHashValues,
  type ViewState,
} from "@carma-mapping/engines-interop/view-sync";

export type UseInitialSceneViewStateOptions = {
  defaultFovDeg?: number;
  maxPitchDeg?: number;
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
      }),
      isResolved: true,
    };
  }, [getHashValues, options.defaultFovDeg, options.maxPitchDeg]);
};
