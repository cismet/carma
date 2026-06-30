import { useCallback, useMemo, type RefObject } from "react";

import type {
  LabelOverlayFrameSubscription,
  LabelOverlayHostBinding,
  LabelOverlayViewChangeProbe,
  LabelOverlayWorldAnchorProjector,
} from "./host";
type UseLabelOverlayHostOptions = {
  kind?: string;
  instanceId?: string;
  containerRef: RefObject<HTMLElement | null>;
  subscribeFrame?: LabelOverlayFrameSubscription | null;
  projectWorldAnchor?: LabelOverlayWorldAnchorProjector | null;
  hasViewChanged?: LabelOverlayViewChangeProbe | null;
  onResize?: (() => void) | null;
  forceLayoutOnPortalRender?: boolean;
};

export const useLabelOverlayHost = ({
  kind,
  instanceId,
  containerRef,
  subscribeFrame,
  projectWorldAnchor,
  hasViewChanged,
  onResize,
  forceLayoutOnPortalRender = true,
}: UseLabelOverlayHostOptions): LabelOverlayHostBinding => {
  const subscribeResponsiveFrame = useCallback<LabelOverlayFrameSubscription>(
    (updateFn) => {
      const cleanupCallbacks: Array<() => void> = [];
      const cleanupFrameSubscription = subscribeFrame?.(updateFn);
      if (typeof cleanupFrameSubscription === "function") {
        cleanupCallbacks.push(cleanupFrameSubscription);
      }
      if (!subscribeFrame && typeof window !== "undefined") {
        let animationFrameId = 0;
        const animationLoop = () => {
          updateFn();
          animationFrameId = window.requestAnimationFrame(animationLoop);
        };
        animationFrameId = window.requestAnimationFrame(animationLoop);
        cleanupCallbacks.push(() => {
          if (animationFrameId) {
            window.cancelAnimationFrame(animationFrameId);
          }
        });
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
      projectWorldAnchor: projectWorldAnchor ?? undefined,
      hasViewChanged: hasViewChanged ?? undefined,
      forceLayoutOnPortalRender,
    }),
    [
      containerRef,
      forceLayoutOnPortalRender,
      hasViewChanged,
      instanceId,
      kind,
      projectWorldAnchor,
      subscribeResponsiveFrame,
    ]
  );
};
