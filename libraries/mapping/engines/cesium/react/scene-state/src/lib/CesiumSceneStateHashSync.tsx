import {
  useSceneStateHashSync,
  type SceneStateLike,
  type UseSceneStateHashSyncOptions,
} from "@carma-providers/hash-state";

import type { CesiumSceneLike } from "./types";
import { useCesiumSceneStateOptional } from "./useCesiumSceneState";

export type CesiumSceneStateHashSyncProps = Omit<
  UseSceneStateHashSyncOptions,
  "sceneState" | "scene"
> & {
  scene?: CesiumSceneLike | null;
};

export const CesiumSceneStateHashSync = ({
  enabled = true,
  scene,
  ...options
}: CesiumSceneStateHashSyncProps) => {
  const sceneState = useCesiumSceneStateOptional();

  useSceneStateHashSync({
    sceneState,
    scene: scene as unknown as SceneStateLike | null | undefined,
    enabled,
    ...options,
  });

  return null;
};
