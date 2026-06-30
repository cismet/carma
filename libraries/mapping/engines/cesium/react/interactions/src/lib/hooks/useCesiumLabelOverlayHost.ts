import { useCallback, useRef, type RefObject } from "react";

import {
  useLabelOverlayHost,
  type LabelOverlayFrameSubscription,
  type LabelOverlayHostBinding,
  type LabelOverlayViewChangeProbe,
  type LabelOverlayWorldAnchorProjector,
} from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma-units";
import {
  Cartesian2,
  Cartesian3,
  Matrix4,
  SceneTransforms,
  defined,
  type Scene,
} from "@carma-cesium";

const worldAnchorScratch = new Cartesian3();
const windowPositionScratch = new Cartesian2();
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

  // Reports whether the camera pose or frustum changed since the last call, so the
  // overlay loop can skip reprojection on frames rendered for unrelated reasons
  // (e.g. an idle-hover requestRender). The view + projection matrices together
  // capture pan/orbit/zoom/fov/aspect. Stateful: caches the last-seen matrices.
  const lastViewMatrixRef = useRef(Matrix4.clone(Matrix4.IDENTITY));
  const lastProjectionMatrixRef = useRef(Matrix4.clone(Matrix4.IDENTITY));
  const hasCachedViewRef = useRef(false);
  const hasViewChanged = useCallback<LabelOverlayViewChangeProbe>(() => {
    if (!scene || scene.isDestroyed()) {
      return true;
    }
    const { viewMatrix, frustum } = scene.camera;
    const projectionMatrix = frustum.projectionMatrix;
    const changed =
      !hasCachedViewRef.current ||
      !Matrix4.equals(viewMatrix, lastViewMatrixRef.current) ||
      !Matrix4.equals(projectionMatrix, lastProjectionMatrixRef.current);
    if (changed) {
      Matrix4.clone(viewMatrix, lastViewMatrixRef.current);
      Matrix4.clone(projectionMatrix, lastProjectionMatrixRef.current);
      hasCachedViewRef.current = true;
    }
    return changed;
  }, [scene]);

  // Project a world anchor to a canvas position so the provider can position
  // `worldAnchor` overlay elements without depending on Cesium itself.
  const projectWorldAnchor = useCallback<LabelOverlayWorldAnchorProjector>(
    (anchor) => {
      if (!scene || scene.isDestroyed()) {
        return null;
      }
      worldAnchorScratch.x = anchor.x;
      worldAnchorScratch.y = anchor.y;
      worldAnchorScratch.z = anchor.z;
      const windowPosition = SceneTransforms.worldToWindowCoordinates(
        scene,
        worldAnchorScratch,
        windowPositionScratch
      );
      if (!defined(windowPosition)) {
        return null;
      }
      return { x: windowPosition.x, y: windowPosition.y } as CssPixelPosition;
    },
    [scene]
  );

  return useLabelOverlayHost({
    kind,
    instanceId,
    containerRef,
    subscribeFrame,
    projectWorldAnchor,
    hasViewChanged,
    onResize: requestRender,
    forceLayoutOnPortalRender,
  });
};
