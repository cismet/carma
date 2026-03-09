/* @refresh reset */
import { useEffect, useMemo, useRef } from "react";

import {
  Cartesian3,
  Color,
  Primitive,
  GUIDE_NORMAL_EPSILON_SQUARED,
  createOrientedDiscModelMatrix,
  getDiscWorldRadius,
  resolveDiscNormal,
  safeCall,
  safeRemovePrimitive,
  type Scene,
} from "@carma/cesium";
import { createRing } from "@carma-mapping/engines/cesium/primitives";
import {
  type CandidateRingSample,
  getAveragedCandidateRingNormal,
  pushCandidateRingSample,
} from "./candidateRingNormalSmoothing";

const CANDIDATE_RING_RADIUS_SCALE = 1.4;
const CANDIDATE_RING_ALPHA = 0.66;
const CANDIDATE_RING_SCREEN_RADIUS_PX = 48;
const CANDIDATE_RING_SMOOTHING_SAMPLE_COUNT = 10;
const CANDIDATE_RING_SMOOTHING_WINDOW_MS = 300;

type CandidateRingQueuedInput = {
  pointRef: Cartesian3 | null;
  surfaceNormalRef: Cartesian3 | null;
};

export type PointCandidateGuide = {
  pointECEF?: Cartesian3 | null;
  surfaceNormalECEF?: Cartesian3 | null;
  verticalOffsetAnchorECEF?: Cartesian3 | null;
};

export type PointCandidateRingIndicatorOptions = {
  scene: Scene | null;
  radius: number;
  candidate?: PointCandidateGuide | null;
  enabled?: boolean;
};

export const usePointCandidateRingIndicator = ({
  scene,
  radius,
  candidate = null,
  enabled = true,
}: PointCandidateRingIndicatorOptions) => {
  const candidatePointECEF = candidate?.pointECEF ?? null;
  const candidateSurfaceNormalECEF = candidate?.surfaceNormalECEF ?? null;
  const candidateVerticalOffsetAnchorECEF =
    candidate?.verticalOffsetAnchorECEF ?? null;
  const candidateRingRef = useRef<Primitive | null>(null);
  const removeCandidateRingPostRenderListenerRef = useRef<(() => void) | null>(
    null
  );
  const candidatePointRef = useRef<Cartesian3 | null>(null);
  const candidateSurfaceNormalRef = useRef<Cartesian3 | null>(null);
  const candidateRingSamplesRef = useRef<CandidateRingSample[]>([]);
  const candidateRingLastQueuedInputRef =
    useRef<CandidateRingQueuedInput | null>(null);
  const candidateRingColor = useMemo(
    () => Color.WHITE.withAlpha(CANDIDATE_RING_ALPHA),
    []
  );

  candidatePointRef.current =
    candidateVerticalOffsetAnchorECEF ?? candidatePointECEF;
  candidateSurfaceNormalRef.current = candidateSurfaceNormalECEF;

  useEffect(() => {
    if (!scene) return;

    safeCall(removeCandidateRingPostRenderListenerRef.current);
    removeCandidateRingPostRenderListenerRef.current = null;

    const candidateRingRadius = Math.max(
      radius * CANDIDATE_RING_RADIUS_SCALE,
      0.1
    );
    const averagedNormal = new Cartesian3();

    const clearCandidateRing = () => {
      if (candidateRingRef.current) {
        safeRemovePrimitive(scene, candidateRingRef.current);
      }
      candidateRingRef.current = null;
      candidateRingSamplesRef.current = [];
      candidateRingLastQueuedInputRef.current = null;
    };

    const ensureCandidateRing = () => {
      const center = candidatePointRef.current;
      if (!center) {
        clearCandidateRing();
        return null;
      }

      let ring = candidateRingRef.current;
      if (!ring) {
        const nextRing = createRing("measurement-candidate-point-ring", {
          radius: 1,
          innerRadius: 0.5,
          color: candidateRingColor,
          segments: 20,
        });
        scene.primitives.add(nextRing);
        candidateRingRef.current = nextRing;
        ring = nextRing;
      }
      return ring;
    };

    const shouldQueueCurrentCandidateSample = () => {
      const currentInput: CandidateRingQueuedInput = {
        pointRef: candidatePointRef.current,
        surfaceNormalRef: candidateSurfaceNormalRef.current,
      };
      const previousInput = candidateRingLastQueuedInputRef.current;
      const hasInputChanged =
        !previousInput ||
        previousInput.pointRef !== currentInput.pointRef ||
        previousInput.surfaceNormalRef !== currentInput.surfaceNormalRef;
      if (!hasInputChanged) {
        return false;
      }
      candidateRingLastQueuedInputRef.current = currentInput;
      return true;
    };

    const queueCandidateSample = (normal: Cartesian3) => {
      pushCandidateRingSample({
        samples: candidateRingSamplesRef.current,
        normal,
        maxSampleCount: CANDIDATE_RING_SMOOTHING_SAMPLE_COUNT,
        timestampMs: performance.now(),
      });
    };

    const getAveragedCandidateNormal = (fallbackNormal: Cartesian3) => {
      return getAveragedCandidateRingNormal({
        samples: candidateRingSamplesRef.current,
        fallbackNormal,
        result: averagedNormal,
        epsilonSquared: GUIDE_NORMAL_EPSILON_SQUARED,
        maxSampleAgeMs: CANDIDATE_RING_SMOOTHING_WINDOW_MS,
        nowMs: performance.now(),
      });
    };

    if (!enabled) {
      clearCandidateRing();
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
      return;
    }

    ensureCandidateRing();

    const updateCandidateRing = () => {
      if (scene.isDestroyed()) {
        return;
      }

      const center = candidatePointRef.current;
      if (!center) {
        clearCandidateRing();
        return;
      }

      const discNormal = resolveDiscNormal(
        center,
        candidateSurfaceNormalRef.current
      );
      const sampledRadius = getDiscWorldRadius(
        scene,
        center,
        discNormal,
        candidateRingRadius,
        CANDIDATE_RING_SCREEN_RADIUS_PX
      );
      const activeRing = candidateRingRef.current ?? ensureCandidateRing();
      if (!activeRing) {
        return;
      }

      if (shouldQueueCurrentCandidateSample()) {
        queueCandidateSample(discNormal);
      }
      const averagedCandidateNormal = getAveragedCandidateNormal(discNormal);
      activeRing.modelMatrix = createOrientedDiscModelMatrix(
        center,
        averagedCandidateNormal,
        sampledRadius,
        activeRing.modelMatrix
      );
    };

    updateCandidateRing();

    removeCandidateRingPostRenderListenerRef.current =
      scene.postRender.addEventListener(updateCandidateRing);
    scene.requestRender();
  }, [enabled, scene, radius, candidateRingColor]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;
    scene.requestRender();
  }, [scene, candidatePointECEF, candidateVerticalOffsetAnchorECEF]);

  useEffect(() => {
    return () => {
      safeCall(removeCandidateRingPostRenderListenerRef.current);
      removeCandidateRingPostRenderListenerRef.current = null;
      if (candidateRingRef.current) {
        safeRemovePrimitive(scene, candidateRingRef.current);
        candidateRingRef.current = null;
      }
      candidateRingSamplesRef.current = [];
    };
  }, [scene]);
};

export default usePointCandidateRingIndicator;
