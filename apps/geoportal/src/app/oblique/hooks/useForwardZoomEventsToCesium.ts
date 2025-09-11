import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject, WheelEvent as ReactWheelEvent } from "react";
import { useCesiumContext } from "@carma-mapping/engines/cesium";

export interface ForwardZoomEventsBindings {
  rootRef: MutableRefObject<HTMLDivElement | null>;
  onWheel: (e: ReactWheelEvent | WheelEvent) => void;
}

/**
 * For overlays above the Cesium canvas, forward zoom-related input (wheel, pinch)
 * to the Cesium canvas so FOV zoom works while the overlay is visible.
 */
export function useForwardZoomEventsToCesium(): ForwardZoomEventsBindings {
  const ctx = useCesiumContext();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const onWheel = useCallback(
    (e: ReactWheelEvent | WheelEvent) => {
      // Prevent browser/page scroll
      e.preventDefault();
      const native: WheelEvent = (e as ReactWheelEvent).nativeEvent
        ? ((e as ReactWheelEvent).nativeEvent as WheelEvent)
        : (e as WheelEvent);

      ctx.withCanvas((canvas) => {
        const forwarded = new WheelEvent("wheel", {
          altKey: native.altKey,
          bubbles: true,
          cancelable: true,
          clientX: native.clientX,
          clientY: native.clientY,
          ctrlKey: native.ctrlKey,
          deltaMode: native.deltaMode,
          deltaX: native.deltaX,
          deltaY: native.deltaY,
          deltaZ: native.deltaZ,
          metaKey: native.metaKey,
          shiftKey: native.shiftKey,
        });
        canvas.dispatchEvent(forwarded);
      });
    },
    [ctx]
  );

  // Safari emits non-standard gesture events for pinch (gesture*).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    let lastScale: number | null = null;
    type SafariGestureEvent = Event & { scale: number };

    const onGestureStart: EventListener = (ev) => {
      ev.preventDefault();
      lastScale = 1;
    };
    const onGestureChange: EventListener = (ev) => {
      ev.preventDefault();
      const e = ev as SafariGestureEvent;
      const scale = typeof e.scale === "number" ? e.scale : 1;
      const deltaScale = lastScale != null ? scale - lastScale : 0;
      lastScale = scale;
      if (deltaScale === 0) return;
      const deltaY = -deltaScale * 300; // negative -> zoom in

      ctx.withCanvas((canvas) => {
        const forwarded = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaY,
        });
        canvas.dispatchEvent(forwarded);
      });
    };
    const onGestureEnd: EventListener = (ev) => {
      ev.preventDefault();
      lastScale = null;
    };

    el.addEventListener("gesturestart", onGestureStart, { passive: false });
    el.addEventListener("gesturechange", onGestureChange, { passive: false });
    el.addEventListener("gestureend", onGestureEnd, { passive: false });

    return () => {
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
    };
  }, [ctx]);

  return { rootRef, onWheel };
}

export default useForwardZoomEventsToCesium;
