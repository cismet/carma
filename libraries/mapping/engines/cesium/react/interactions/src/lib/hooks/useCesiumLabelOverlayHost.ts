import { useCallback, useRef, type RefObject } from "react";

import {
  useLabelOverlayHost,
  type LabelOverlayFrameSubscription,
  type LabelOverlayHostBinding,
  type LabelOverlayViewChangeProbe,
} from "@carma-providers/label-overlay";
import { Matrix4, type Scene } from "@carma-cesium";
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

  // Reports whether anything affecting on-screen projection changed since the last
  // call, so the overlay loop can skip reprojection on frames rendered for
  // unrelated reasons (e.g. an idle-hover requestRender). The view + projection
  // matrices capture pan/orbit/zoom/fov/aspect; the canvas CSS size captures
  // aspect-preserving resizes / browser-zoom (which leave both matrices identical
  // yet change the pixel mapping in worldToWindowCoordinates). Stateful: caches
  // the last-seen values.
  const lastViewMatrixRef = useRef(Matrix4.clone(Matrix4.IDENTITY));
  const lastProjectionMatrixRef = useRef(Matrix4.clone(Matrix4.IDENTITY));
  const lastCanvasWidthRef = useRef(0);
  const lastCanvasHeightRef = useRef(0);
  const hasCachedViewRef = useRef(false);
  const hasViewChanged = useCallback<LabelOverlayViewChangeProbe>(() => {
    if (!scene || scene.isDestroyed()) {
      return true;
    }
    const { viewMatrix, frustum } = scene.camera;
    const projectionMatrix = frustum.projectionMatrix;
    const { clientWidth, clientHeight } = scene.canvas;
    const changed =
      !hasCachedViewRef.current ||
      clientWidth !== lastCanvasWidthRef.current ||
      clientHeight !== lastCanvasHeightRef.current ||
      !Matrix4.equals(viewMatrix, lastViewMatrixRef.current) ||
      !Matrix4.equals(projectionMatrix, lastProjectionMatrixRef.current);
    if (changed) {
      Matrix4.clone(viewMatrix, lastViewMatrixRef.current);
      Matrix4.clone(projectionMatrix, lastProjectionMatrixRef.current);
      lastCanvasWidthRef.current = clientWidth;
      lastCanvasHeightRef.current = clientHeight;
      hasCachedViewRef.current = true;
    }
    return changed;
  }, [scene]);

  return useLabelOverlayHost({
    kind,
    instanceId,
    containerRef,
    subscribeFrame,
    hasViewChanged,
    onResize: requestRender,
    forceLayoutOnPortalRender,
  });
};
