import { useMemo } from "react";
import type { SceneLike } from "@carma-mapping/engines/cesium/api";
import type { WritePriority } from "../../core/types";
import { applyToCesium, readFromCesium } from "../../adapters/cesium";
import {
  useLiveRuntimeBridge,
  type LiveRuntimeBridgeHandle,
} from "./useLiveRuntimeBridge";

const attachSceneFrameListener = (
  scene: SceneLike,
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
  scene?: SceneLike | null;
  enabled?: boolean;
  pushPriority?: WritePriority;
  claimPriority?: WritePriority;
  claimBeforePush?: boolean;
  claimOnInteraction?: boolean;
};

export type CesiumRuntimeBridgeHandle = LiveRuntimeBridgeHandle;

export const useCesiumRuntimeBridge = ({
  id,
  scene = null,
  enabled = true,
  pushPriority = "sync",
  claimPriority = "user-interaction",
  claimBeforePush = true,
  claimOnInteraction = false,
}: UseCesiumRuntimeBridgeOptions): CesiumRuntimeBridgeHandle => {
  const adapter = useLiveRuntimeBridge({
    id,
    engine: "cesium",
    runtime: scene,
    enabled,
    pushPriority,
    claimPriority,
    claimBeforePush,
    claimOnInteraction,
    read: (runtime, sourceId) => readFromCesium(runtime, sourceId),
    apply: applyToCesium,
    subscribe: attachSceneFrameListener,
    getInteractionElement: (runtime) =>
      runtime.canvas as HTMLElement | null | undefined,
  });

  return useMemo(() => adapter, [adapter]);
};
