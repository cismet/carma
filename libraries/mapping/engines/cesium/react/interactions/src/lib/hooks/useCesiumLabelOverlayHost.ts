import { useCallback, type RefObject } from "react";

import {
  useLabelOverlayHost,
  type LabelOverlayFrameSubscription,
  type LabelOverlayHostBinding,
} from "@carma-providers/label-overlay";
import type { Scene } from "@carma/cesium";
export const CESIUM_LABEL_OVERLAY_FRAME_PHASES = {
  PRE_RENDER: "preRender",
  POST_RENDER: "postRender",
} as const;

export type CesiumLabelOverlayFramePhase =
  (typeof CESIUM_LABEL_OVERLAY_FRAME_PHASES)[keyof typeof CESIUM_LABEL_OVERLAY_FRAME_PHASES];

type UseCesiumLabelOverlayHostOptions = {
  scene: Scene | null;
  containerRef: RefObject<HTMLElement | null>;
  kind?: string;
  instanceId?: string;
  forceLayoutOnPortalRender?: boolean;
  framePhase?: CesiumLabelOverlayFramePhase;
};

export const useCesiumLabelOverlayHost = ({
  scene,
  containerRef,
  kind = "cesium",
  instanceId,
  forceLayoutOnPortalRender = true,
  framePhase = CESIUM_LABEL_OVERLAY_FRAME_PHASES.POST_RENDER,
}: UseCesiumLabelOverlayHostOptions): LabelOverlayHostBinding => {
  const subscribeFrame = useCallback<LabelOverlayFrameSubscription>(
    (updateFn) => {
      if (!scene || scene.isDestroyed()) {
        return;
      }

      const frameEvent =
        framePhase === CESIUM_LABEL_OVERLAY_FRAME_PHASES.PRE_RENDER
          ? scene.preRender
          : scene.postRender;
      const removeFrameListener = frameEvent.addEventListener(updateFn);

      return () => {
        removeFrameListener?.();
      };
    },
    [framePhase, scene]
  );

  const requestRender = useCallback(() => {
    if (!scene || scene.isDestroyed()) {
      return;
    }

    scene.requestRender();
  }, [scene]);

  return useLabelOverlayHost({
    kind,
    instanceId,
    containerRef,
    subscribeFrame,
    onResize: requestRender,
    forceLayoutOnPortalRender,
  });
};
