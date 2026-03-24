import { useCallback, type RefObject } from "react";

import type { Scene } from "@carma/cesium";
import {
  useLabelOverlayHost,
  type LabelOverlayFrameSubscription,
  type LabelOverlayHostBinding,
} from "@carma-providers/label-overlay";

type UseCesiumLabelOverlayHostOptions = {
  scene: Scene | null;
  containerRef: RefObject<HTMLElement | null>;
  kind?: string;
  instanceId?: string;
};

export const useCesiumLabelOverlayHost = ({
  scene,
  containerRef,
  kind = "cesium",
  instanceId,
}: UseCesiumLabelOverlayHostOptions): LabelOverlayHostBinding => {
  const subscribeFrame = useCallback<LabelOverlayFrameSubscription>(
    (updateFn) => {
      if (!scene || scene.isDestroyed()) {
        return;
      }

      const removePreRenderListener =
        scene.preRender.addEventListener(updateFn);

      return () => {
        removePreRenderListener?.();
      };
    },
    [scene]
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
  });
};
