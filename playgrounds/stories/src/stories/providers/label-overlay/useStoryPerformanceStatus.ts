import { useEffect, useMemo, useRef, useState } from "react";
import type { Scene } from "@carma/cesium";

type StoryPerformanceStatus = {
  fps: number | null;
  averageFrameMs: number | null;
};

const PERFORMANCE_SAMPLE_WINDOW_MS = 500;

const formatMetric = (value: number | null, digits: number): number | null =>
  value !== null && Number.isFinite(value)
    ? Number(value.toFixed(digits))
    : null;

export const useAnimationFramePerformanceStatus = (
  enabled: boolean = true
): StoryPerformanceStatus => {
  const [status, setStatus] = useState<StoryPerformanceStatus>({
    fps: null,
    averageFrameMs: null,
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setStatus({ fps: null, averageFrameMs: null });
      return;
    }

    let animationFrameId = 0;
    let lastFrameTimeMs: number | null = null;
    let sampleStartedAtMs = performance.now();
    let frameCount = 0;
    let frameDurationSumMs = 0;

    const tick = (nowMs: number) => {
      if (lastFrameTimeMs !== null) {
        frameCount += 1;
        frameDurationSumMs += nowMs - lastFrameTimeMs;
      }
      lastFrameTimeMs = nowMs;

      const sampleDurationMs = nowMs - sampleStartedAtMs;
      if (sampleDurationMs >= PERFORMANCE_SAMPLE_WINDOW_MS && frameCount > 0) {
        setStatus({
          fps: formatMetric((frameCount * 1000) / sampleDurationMs, 1),
          averageFrameMs: formatMetric(frameDurationSumMs / frameCount, 2),
        });
        sampleStartedAtMs = nowMs;
        frameCount = 0;
        frameDurationSumMs = 0;
      }

      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);
    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [enabled]);

  return status;
};

export const useCesiumFramePerformanceStatus = (
  scene: Scene | null,
  enabled: boolean = true
): StoryPerformanceStatus => {
  const [status, setStatus] = useState<StoryPerformanceStatus>({
    fps: null,
    averageFrameMs: null,
  });
  const renderStartedAtMsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !scene || scene.isDestroyed()) {
      setStatus({ fps: null, averageFrameMs: null });
      return;
    }

    let sampleStartedAtMs = performance.now();
    let frameCount = 0;
    let renderDurationSumMs = 0;

    const handlePreRender = () => {
      renderStartedAtMsRef.current = performance.now();
    };

    const handlePostRender = () => {
      const nowMs = performance.now();
      const renderStartedAtMs = renderStartedAtMsRef.current;
      renderStartedAtMsRef.current = null;
      if (renderStartedAtMs !== null) {
        renderDurationSumMs += nowMs - renderStartedAtMs;
      }
      frameCount += 1;

      const sampleDurationMs = nowMs - sampleStartedAtMs;
      if (sampleDurationMs < PERFORMANCE_SAMPLE_WINDOW_MS || frameCount === 0) {
        return;
      }

      setStatus({
        fps: formatMetric((frameCount * 1000) / sampleDurationMs, 1),
        averageFrameMs: formatMetric(renderDurationSumMs / frameCount, 2),
      });
      sampleStartedAtMs = nowMs;
      frameCount = 0;
      renderDurationSumMs = 0;
    };

    const removePreRenderListener =
      scene.preRender.addEventListener(handlePreRender);
    const removePostRenderListener =
      scene.postRender.addEventListener(handlePostRender);

    return () => {
      removePreRenderListener?.();
      removePostRenderListener?.();
    };
  }, [enabled, scene]);

  return status;
};

export const formatStoryPerformanceLabel = (
  status: StoryPerformanceStatus
): string => {
  const fpsLabel = status.fps?.toFixed(1) ?? "?";
  const frameMsLabel = status.averageFrameMs?.toFixed(2) ?? "?";
  return `${fpsLabel} fps / ${frameMsLabel} ms`;
};
