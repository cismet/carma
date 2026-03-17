/* @refresh reset */
import { useEffect, useMemo, useRef } from "react";

import {
  Cartesian2,
  Cartesian3,
  Color,
  Primitive,
  GUIDE_NORMAL_EPSILON_SQUARED,
  createOrientedDiscModelMatrix,
  getDiscWorldRadius,
  isValidScene,
  resolveDiscNormal,
  safeCall,
  safeRemovePrimitive,
  createRing,
  cartesian3FromGeographicCoordinate,
  sampleSurfaceNormalAtScreenPosition,
} from "@carma/cesium";
import {
  type PreviewRingSample,
  getAveragedPreviewRingNormal,
  pushPreviewRingSample,
} from "@carma-mapping/annotations/core";

import type { RuntimeCoordinate } from "../store";
import type { RuntimeScene } from "../types/runtimeScene.types";
import { pointPreviewRingVisualDefaults } from "../config/pointPreviewVisualDefaults";

type PreviewRingQueuedInput = {
  pointRef: Cartesian3 | null;
  surfaceNormalRef: Cartesian3 | null;
};

type PointPreviewRingIndicatorInput = {
  coordinate?: RuntimeCoordinate | null;
  screenPosition?: { x: number; y: number } | null;
};

type PointPreviewRingIndicatorOptions = {
  radius: number;
  enabled?: boolean;
};

export const usePointPreviewRingIndicator = (
  scene: RuntimeScene | null,
  preview: PointPreviewRingIndicatorInput | null = null,
  { radius, enabled = true }: PointPreviewRingIndicatorOptions
) => {
  const previewCoordinate = preview?.coordinate ?? null;
  const previewScreenPosition = preview?.screenPosition ?? null;
  const previewRingRef = useRef<Primitive | null>(null);
  const removePreviewRingPostRenderListenerRef = useRef<(() => void) | null>(
    null
  );
  const previewPointRef = useRef<Cartesian3 | null>(null);
  const previewSurfaceNormalRef = useRef<Cartesian3 | null>(null);
  const previewRingSamplesRef = useRef<PreviewRingSample[]>([]);
  const previewRingLastQueuedInputRef = useRef<PreviewRingQueuedInput | null>(
    null
  );
  const previewRingColor = useMemo(
    () => Color.WHITE.withAlpha(pointPreviewRingVisualDefaults.alpha),
    []
  );

  const previewPointECEF = useMemo(() => {
    if (!previewCoordinate) {
      return null;
    }
    return cartesian3FromGeographicCoordinate(previewCoordinate);
  }, [previewCoordinate]);

  const previewSurfaceNormalECEF = useMemo(() => {
    if (
      !scene ||
      scene.isDestroyed() ||
      !previewPointECEF ||
      !previewScreenPosition
    ) {
      return null;
    }

    return sampleSurfaceNormalAtScreenPosition(
      scene,
      new Cartesian2(previewScreenPosition.x, previewScreenPosition.y),
      previewPointECEF
    );
  }, [previewPointECEF, previewScreenPosition, scene]);

  previewPointRef.current = previewPointECEF;
  previewSurfaceNormalRef.current = previewSurfaceNormalECEF;

  useEffect(() => {
    if (!isValidScene(scene)) return;

    safeCall(removePreviewRingPostRenderListenerRef.current);
    removePreviewRingPostRenderListenerRef.current = null;

    const previewRingRadius = Math.max(
      radius * pointPreviewRingVisualDefaults.radiusScale,
      0.1
    );
    const averagedNormal = new Cartesian3();

    const clearPreviewRing = () => {
      if (previewRingRef.current) {
        safeRemovePrimitive(scene, previewRingRef.current);
      }
      previewRingRef.current = null;
      previewRingSamplesRef.current = [];
      previewRingLastQueuedInputRef.current = null;
    };

    const ensurePreviewRing = () => {
      const center = previewPointRef.current;
      if (!center) {
        clearPreviewRing();
        return null;
      }

      let ring = previewRingRef.current;
      if (!ring) {
        const nextRing = createRing(
          pointPreviewRingVisualDefaults.primitiveId,
          {
            radius: 1,
            innerRadius: 0.5,
            color: previewRingColor,
            segments: 20,
          }
        );
        scene.primitives.add(nextRing);
        previewRingRef.current = nextRing;
        ring = nextRing;
      }
      return ring;
    };

    const shouldQueueCurrentPreviewSample = () => {
      const currentInput: PreviewRingQueuedInput = {
        pointRef: previewPointRef.current,
        surfaceNormalRef: previewSurfaceNormalRef.current,
      };
      const previousInput = previewRingLastQueuedInputRef.current;
      const hasInputChanged =
        !previousInput ||
        previousInput.pointRef !== currentInput.pointRef ||
        previousInput.surfaceNormalRef !== currentInput.surfaceNormalRef;
      if (!hasInputChanged) {
        return false;
      }
      previewRingLastQueuedInputRef.current = currentInput;
      return true;
    };

    const queuePreviewSample = (normal: Cartesian3) => {
      pushPreviewRingSample({
        samples: previewRingSamplesRef.current,
        normal,
        maxSampleCount: pointPreviewRingVisualDefaults.smoothingSampleCount,
        timestampMs: performance.now(),
      });
    };

    const getAveragedPreviewNormal = (fallbackNormal: Cartesian3) => {
      return getAveragedPreviewRingNormal({
        samples: previewRingSamplesRef.current,
        fallbackNormal,
        result: averagedNormal,
        epsilonSquared: GUIDE_NORMAL_EPSILON_SQUARED,
        maxSampleAgeMs: pointPreviewRingVisualDefaults.smoothingWindowMs,
        nowMs: performance.now(),
      });
    };

    if (!enabled) {
      clearPreviewRing();
      scene.requestRender();
      return;
    }

    ensurePreviewRing();

    const updatePreviewRing = () => {
      if (!isValidScene(scene)) {
        return;
      }

      const center = previewPointRef.current;
      if (!center) {
        clearPreviewRing();
        return;
      }

      const discNormal = resolveDiscNormal(
        center,
        previewSurfaceNormalRef.current
      );
      const sampledRadius = getDiscWorldRadius(
        scene,
        center,
        discNormal,
        previewRingRadius,
        pointPreviewRingVisualDefaults.screenRadiusPx
      );
      const activeRing = previewRingRef.current ?? ensurePreviewRing();
      if (!activeRing) {
        return;
      }

      if (shouldQueueCurrentPreviewSample()) {
        queuePreviewSample(discNormal);
      }
      const averagedPreviewNormal = getAveragedPreviewNormal(discNormal);
      activeRing.modelMatrix = createOrientedDiscModelMatrix(
        center,
        averagedPreviewNormal,
        sampledRadius,
        activeRing.modelMatrix
      );
    };

    updatePreviewRing();

    removePreviewRingPostRenderListenerRef.current =
      scene.postRender.addEventListener(updatePreviewRing);
    scene.requestRender();
  }, [enabled, scene, radius, previewRingColor]);

  useEffect(() => {
    if (!isValidScene(scene)) return;
    scene.requestRender();
  }, [scene, previewPointECEF]);

  useEffect(() => {
    return () => {
      safeCall(removePreviewRingPostRenderListenerRef.current);
      removePreviewRingPostRenderListenerRef.current = null;
      if (previewRingRef.current) {
        safeRemovePrimitive(scene, previewRingRef.current);
        previewRingRef.current = null;
      }
      previewRingSamplesRef.current = [];
    };
  }, [scene]);
};

export default usePointPreviewRingIndicator;
