import { useMemo } from "react";

import { useHashState } from "../HashStateProvider";
import { readInitialSceneStateHashSnapshotFromHashValues } from "../scene-state-hash/sceneStateHashInitialSnapshot";
import type { SceneStateHashSnapshot } from "../scene-state-hash/sceneStateHashTypes";

export const useInitialSceneStateHashSnapshot = ({
  defaultFovDeg,
  defaultZoom,
}: {
  defaultFovDeg?: number;
  defaultZoom?: number;
} = {}): {
  initialCameraState: SceneStateHashSnapshot | null;
  isResolved: boolean;
} => {
  const { getHashValues } = useHashState();

  return useMemo(() => {
    const hashValues = getHashValues();
    return {
      initialCameraState: readInitialSceneStateHashSnapshotFromHashValues(
        hashValues,
        defaultFovDeg,
        defaultZoom,
        typeof window === "undefined" ? 1920 : window.innerWidth,
        typeof window === "undefined" ? 1080 : window.innerHeight
      ),
      isResolved: true,
    };
  }, [defaultFovDeg, defaultZoom, getHashValues]);
};
