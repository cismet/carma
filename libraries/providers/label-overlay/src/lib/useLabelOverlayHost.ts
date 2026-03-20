import { useCallback, useMemo, type RefObject } from "react";

import type {
  LabelOverlayFrameSubscription,
  LabelOverlayHostBinding,
} from "./host";

type UseLabelOverlayHostOptions = {
  kind?: string;
  instanceId?: string;
  containerRef: RefObject<HTMLElement | null>;
  subscribeFrame?: LabelOverlayFrameSubscription | null;
  onResize?: (() => void) | null;
};

export const useLabelOverlayHost = ({
  kind,
  instanceId,
  containerRef,
  subscribeFrame,
  onResize,
}: UseLabelOverlayHostOptions): LabelOverlayHostBinding => {
  const subscribeResponsiveFrame = useCallback<LabelOverlayFrameSubscription>(
    (updateFn) => {
      const cleanupCallbacks: Array<() => void> = [];
      const cleanupFrameSubscription = subscribeFrame?.(updateFn);
      if (typeof cleanupFrameSubscription === "function") {
        cleanupCallbacks.push(cleanupFrameSubscription);
      }

      if (typeof window !== "undefined") {
        let resizeAnimationFrameId = 0;
        const scheduleResizeUpdate = () => {
          onResize?.();
          if (resizeAnimationFrameId) {
            window.cancelAnimationFrame(resizeAnimationFrameId);
          }
          resizeAnimationFrameId = window.requestAnimationFrame(() => {
            resizeAnimationFrameId = 0;
            updateFn();
          });
        };

        const target = containerRef.current;
        if (typeof ResizeObserver !== "undefined" && target) {
          const resizeObserver = new ResizeObserver(() => {
            scheduleResizeUpdate();
          });
          resizeObserver.observe(target);
          cleanupCallbacks.push(() => {
            resizeObserver.disconnect();
          });
        } else {
          window.addEventListener("resize", scheduleResizeUpdate);
          cleanupCallbacks.push(() => {
            window.removeEventListener("resize", scheduleResizeUpdate);
          });
        }

        cleanupCallbacks.push(() => {
          if (resizeAnimationFrameId) {
            window.cancelAnimationFrame(resizeAnimationFrameId);
          }
        });
      }

      return () => {
        cleanupCallbacks.forEach((cleanup) => {
          cleanup();
        });
      };
    },
    [containerRef, onResize, subscribeFrame]
  );

  return useMemo(
    () => ({
      kind,
      instanceId,
      containerRef,
      subscribeFrame: subscribeResponsiveFrame,
    }),
    [containerRef, instanceId, kind, subscribeResponsiveFrame]
  );
};
