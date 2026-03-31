import { useMemo } from "react";
import type { Scene } from "@carma-mapping/engines/cesium/api";
import type { WritePriority } from "../../core/types";
import { applyToCesium, readFromCesium } from "../../adapters/cesium";
import {
  useSubscribedRuntimeBridge,
  type SubscribedRuntimeBridgeHandle,
} from "./useSubscribedRuntimeBridge";

const attachSceneFrameListener = (
  scene: Scene,
  listener: () => void
): (() => void) | null => {
  const frameEvent = scene.postRender ?? scene.preRender;
  if (!frameEvent) {
    return null;
  }

  frameEvent.addEventListener(listener);
  return () => {
    frameEvent.removeEventListener(listener);
  };
};

export type UseCesiumRuntimeBridgeOptions = {
  id: string;
  scene?: Scene | null;
  enabled?: boolean;
  pushPriority?: WritePriority;
  claimPriority?: WritePriority;
  claimBeforePush?: boolean;
  claimOnInteraction?: boolean;
  onInteraction?: () => void;
};

export const useCesiumRuntimeBridge = ({
  id,
  scene = null,
  enabled = true,
  pushPriority = "sync",
  claimPriority = "user-interaction",
  claimBeforePush = true,
  claimOnInteraction = false,
  onInteraction,
}: UseCesiumRuntimeBridgeOptions): SubscribedRuntimeBridgeHandle => {
  const adapter = useSubscribedRuntimeBridge({
    id,
    engine: "cesium",
    runtime: scene,
    enabled,
    pushPriority,
    claimPriority,
    claimBeforePush,
    claimOnInteraction,
    onInteraction,
    read: (runtime, sourceId) => readFromCesium(runtime, sourceId),
    apply: applyToCesium,
    subscribe: attachSceneFrameListener,
    getInteractionElement: (runtime) =>
      runtime.canvas as HTMLElement | null | undefined,
  });

  return useMemo(() => adapter, [adapter]);
};
