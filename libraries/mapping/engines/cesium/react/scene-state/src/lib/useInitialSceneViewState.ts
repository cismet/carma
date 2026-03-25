import { useMemo } from "react";
import { useHashState } from "@carma-providers/hash-state";
import {
  type HashZoomConvention,
  type ViewState,
} from "@carma-mapping/engines-interop/view-sync";

import { createCesiumViewStateHashCodec } from "./createCesiumViewStateHashCodec";

export type UseInitialSceneViewStateOptions = {
  defaultFovDeg?: number;
  zoomConvention?: HashZoomConvention;
};

export const useInitialSceneViewState = (
  options: UseInitialSceneViewStateOptions = {}
): {
  initialViewState: ViewState | null;
  isResolved: boolean;
} => {
  const { getHashValues } = useHashState();

  return useMemo(() => {
    const codec = createCesiumViewStateHashCodec(options);
    const hashValues = getHashValues();
    return {
      initialViewState: codec.decode(hashValues),
      isResolved: true,
    };
  }, [getHashValues, options.defaultFovDeg, options.zoomConvention]);
};
