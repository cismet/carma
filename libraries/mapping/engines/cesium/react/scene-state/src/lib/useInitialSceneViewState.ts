import { useMemo } from "react";
import { useHashState } from "@carma-providers/hash-state";
import {
  readSceneViewStateFromHashValues,
  type SceneViewState,
} from "@carma-mapping/engines-interop";

export const useInitialSceneViewState = (): {
  initialViewState: SceneViewState | null;
  isResolved: boolean;
} => {
  const { getHashValues } = useHashState();

  return useMemo(() => {
    const hashValues = getHashValues();
    return {
      initialViewState: readSceneViewStateFromHashValues(hashValues),
      isResolved: true,
    };
  }, [getHashValues]);
};
