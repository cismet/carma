/* @refresh reset */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Cartesian3, Color, Primitive } from "@carma-cesium";
import {
  GUIDE_NORMAL_EPSILON_SQUARED,
  createOrientedDiscModelMatrix,
  isValidScene,
  resolveDiscNormal,
  safeCall,
  safeRemovePrimitive,
  createRing,
  type RingMaterialPreset,
} from "@carma-mapping/engines/cesium/core";
import {
  type PreviewRingSample,
  getAveragedPreviewRingNormal,
  pushPreviewRingSample,
} from "@carma-mapping/annotations/core";

import type { RuntimeCoordinate } from "../store";
import type { RuntimeScene } from "../types/runtimeScene.types";
import { pointPreviewRingVisualDefaults } from "../config/pointPreviewVisualDefaults";
import { resolvePointPreviewDiscRadius } from "./resolvePointPreviewDiscRadius";

type PreviewRingQueuedInput = {
  version: number;
};

export type PointPreviewRingIndicatorSample = {
  pointECEF?: Cartesian3 | null;
  surfaceNormalECEF?: Cartesian3 | null;
};

type PointPreviewRingIndicatorOptions = {
  radius: number;
  enabled?: boolean;
  color?: string;
  opacity?: number;
  materialPreset?: RingMaterialPreset;
  innerHoleRadiusRatio?: number;
  scalingMode?: "screen" | "world";
  targetScreenRadiusCssPx?: number;
};

type PointPreviewRingIndicatorApi = {
  setPreview: (preview: PointPreviewRingIndicatorSample | null) => void;
  clearPreview: () => void;
};

export const usePointPreviewRingIndicator = (
  scene: RuntimeScene | null,
  {
    radius,
    enabled = true,
    color,
    opacity,
    materialPreset,
    innerHoleRadiusRatio = pointPreviewRingVisualDefaults.innerHoleRadiusRatio,
    scalingMode = pointPreviewRingVisualDefaults.scalingMode,
    targetScreenRadiusCssPx = pointPreviewRingVisualDefaults.targetScreenRadiusCssPx,
  }: PointPreviewRingIndicatorOptions
): PointPreviewRingIndicatorApi => {
  const previewRingRef = useRef<Primitive | null>(null);
  const removePreviewRingPostRenderListenerRef = useRef<(() => void) | null>(
    null
  );
  const previewPointRef = useRef<Cartesian3 | null>(null);
  const previewSurfaceNormalRef = useRef<Cartesian3 | null>(null);
  const previewInputVersionRef = useRef(0);
  const previewRingSamplesRef = useRef<PreviewRingSample[]>([]);
  const previewRingLastQueuedInputRef = useRef<PreviewRingQueuedInput | null>(
    null
  );
  const updatePreviewRingRef = useRef<() => void>(() => undefined);
  const clearPreviewRingRef = useRef<() => void>(() => undefined);
  const previewRingColor = useMemo(
    () => {
      const resolvedOpacity =
        typeof opacity === "number" && Number.isFinite(opacity)
          ? opacity
          : pointPreviewRingVisualDefaults.alpha;
      if (!color) {
        return Color.WHITE.withAlpha(resolvedOpacity);
      }

      return (
        Color.fromCssColorString(color)?.withAlpha(resolvedOpacity) ??
        Color.WHITE.withAlpha(resolvedOpacity)
      );
    },
    [color, opacity]
  );

  useEffect(() => {
    if (!isValidScene(scene)) return;

    safeCall(removePreviewRingPostRenderListenerRef.current);
    removePreviewRingPostRenderListenerRef.current = null;

    const previewRingRadius = Math.max(radius, 0.1);
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
            innerRadius: Math.min(Math.max(innerHoleRadiusRatio, 0), 0.999),
            color: previewRingColor,
            opacity: previewRingColor.alpha,
            materialPreset:
              materialPreset ?? pointPreviewRingVisualDefaults.materialPreset,
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
        version: previewInputVersionRef.current,
      };
      const previousInput = previewRingLastQueuedInputRef.current;
      const hasInputChanged =
        !previousInput || previousInput.version !== currentInput.version;
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
      const sampledRadius = resolvePointPreviewDiscRadius({
        scene,
        pointECEF: center,
        discNormalECEF: discNormal,
        radiusMeters: previewRingRadius,
        scalingMode,
        targetScreenRadiusCssPx,
      });
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

    updatePreviewRingRef.current = updatePreviewRing;
    clearPreviewRingRef.current = clearPreviewRing;
    updatePreviewRing();

    removePreviewRingPostRenderListenerRef.current =
      scene.postRender.addEventListener(updatePreviewRing);
    scene.requestRender();
    return () => {
      updatePreviewRingRef.current = () => undefined;
      clearPreviewRingRef.current = () => undefined;
    };
  }, [
    enabled,
    innerHoleRadiusRatio,
    materialPreset,
    radius,
    scene,
    scalingMode,
    targetScreenRadiusCssPx,
    previewRingColor,
  ]);

  const setPreview = useCallback(
    (preview: PointPreviewRingIndicatorSample | null) => {
      if (!preview?.pointECEF) {
        previewPointRef.current = null;
        previewSurfaceNormalRef.current = null;
        previewInputVersionRef.current += 1;
        clearPreviewRingRef.current();
        if (isValidScene(scene)) {
          scene.requestRender();
        }
        return;
      }

      previewPointRef.current = Cartesian3.clone(
        preview.pointECEF,
        previewPointRef.current ?? new Cartesian3()
      );
      previewSurfaceNormalRef.current = preview.surfaceNormalECEF
        ? Cartesian3.clone(
            preview.surfaceNormalECEF,
            previewSurfaceNormalRef.current ?? new Cartesian3()
          )
        : null;
      previewInputVersionRef.current += 1;
      updatePreviewRingRef.current();
      if (isValidScene(scene)) {
        scene.requestRender();
      }
    },
    [scene]
  );

  const clearPreview = useCallback(() => {
    previewPointRef.current = null;
    previewSurfaceNormalRef.current = null;
    previewInputVersionRef.current += 1;
    clearPreviewRingRef.current();
    if (isValidScene(scene)) {
      scene.requestRender();
    }
  }, [scene]);

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

  return useMemo(
    () => ({
      setPreview,
      clearPreview,
    }),
    [clearPreview, setPreview]
  );
};

export default usePointPreviewRingIndicator;
