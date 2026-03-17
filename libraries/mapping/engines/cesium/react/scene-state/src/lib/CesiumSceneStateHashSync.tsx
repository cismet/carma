import {
  useSceneDescriptorHashSync,
  type SceneDescriptorHashSyncSceneLike,
  type UseSceneDescriptorHashSyncOptions,
} from "@carma-providers/hash-state";

import type { CesiumSceneLike } from "./types";
import { useCesiumSceneStateOptional } from "./useCesiumSceneState";

export type CesiumSceneStateHashSyncProps = Omit<
  UseSceneDescriptorHashSyncOptions,
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

  useSceneDescriptorHashSync({
    sceneState,
    scene: scene as unknown as SceneDescriptorHashSyncSceneLike | null | undefined,
    enabled,
    ...options,
  });

  return null;
};