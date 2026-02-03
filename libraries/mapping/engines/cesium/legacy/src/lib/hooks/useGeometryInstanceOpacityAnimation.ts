import { useCallback, useEffect, useRef } from "react";

import type { Easing as EasingFunction } from "@carma-commons/math";
import {
  animateOpacity,
  applyGeometryInstanceOpacity,
  readGeometryInstanceOpacity,
  type GeometryInstanceRef,
} from "../utils";

type OpacityAnimationConfig = {
  durationMs: number;
  easing: EasingFunction;
};

type AnimateGeometryInstanceOpacityOptions = {
  key: string;
  instances: GeometryInstanceRef[];
  targetOpacity: number;
  requestRender: () => void;
};

type UseGeometryInstanceOpacityAnimationResult = {
  animateGeometryInstanceOpacity: (
    options: AnimateGeometryInstanceOpacityOptions
  ) => void;
};

export const useGeometryInstanceOpacityAnimation = (
  config: OpacityAnimationConfig
): UseGeometryInstanceOpacityAnimationResult => {
  const animationCancelsRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    const cancels = animationCancelsRef.current;
    return () => {
      cancels.forEach((cancel) => cancel());
      cancels.clear();
    };
  }, []);

  const animateGeometryInstanceOpacity = useCallback(
    ({ key, instances, targetOpacity, requestRender }) => {
      const existingCancel = animationCancelsRef.current.get(key);
      if (existingCancel) {
        existingCancel();
        animationCancelsRef.current.delete(key);
      }

      const startOpacity = readGeometryInstanceOpacity(instances);
      if (startOpacity === null) {
        let retryFrame = 0;
        let cancelled = false;
        const retry = () => {
          if (cancelled) return;
          const nextOpacity = readGeometryInstanceOpacity(instances);
          if (nextOpacity === null) {
            retryFrame = requestAnimationFrame(retry);
            return;
          }

          const cancelAnimation = animateOpacity(nextOpacity, targetOpacity, {
            durationMs: config.durationMs,
            easing: config.easing,
            onUpdate: (value) => {
              applyGeometryInstanceOpacity(instances, value);
              requestRender();
            },
          });
          animationCancelsRef.current.set(key, cancelAnimation);
        };

        retryFrame = requestAnimationFrame(retry);
        animationCancelsRef.current.set(key, () => {
          if (cancelled) return;
          cancelled = true;
          cancelAnimationFrame(retryFrame);
        });
        return;
      }

      const cancelAnimation = animateOpacity(startOpacity, targetOpacity, {
        durationMs: config.durationMs,
        easing: config.easing,
        onUpdate: (value) => {
          applyGeometryInstanceOpacity(instances, value);
          requestRender();
        },
      });
      animationCancelsRef.current.set(key, cancelAnimation);
    },
    [config.durationMs, config.easing]
  );

  return { animateGeometryInstanceOpacity };
};
