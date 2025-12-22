import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { useFovWheelZoom } from "@carma-mapping/engines/cesium";

const handledNativeEvents = new WeakSet<Event>();

export interface ForwardZoomEventsBindings {
  rootRef: MutableRefObject<HTMLDivElement | null>;
}

/**
 * For overlays above the Cesium canvas, forward zoom-related input (wheel, pinch)
 * to the Cesium canvas so FOV zoom works while the overlay is visible.
 */
export function useForwardZoomEventsToCesium(): ForwardZoomEventsBindings {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Use Cesium FOV wheel zoom directly; re-render after each FOV change
  const { handleWheel } = useFovWheelZoom(true);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const onWheel: EventListener = (ev) => {
      if (handledNativeEvents.has(ev)) return;
      handledNativeEvents.add(ev);
      const e = ev as WheelEvent;
      if (e.cancelable) {
        e.preventDefault();
      }
      handleWheel(e);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [handleWheel]);

  // Safari emits non-standard gesture events for pinch (gesture*).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    let lastScale: number | null = null;
    type SafariGestureEvent = Event & { scale: number };

    const onGestureStart: EventListener = (ev) => {
      if (handledNativeEvents.has(ev)) return;
      handledNativeEvents.add(ev);
      ev.preventDefault();
      lastScale = 1;
    };
    const onGestureChange: EventListener = (ev) => {
      if (handledNativeEvents.has(ev)) return;
      handledNativeEvents.add(ev);
      ev.preventDefault();
      const e = ev as SafariGestureEvent;
      const scale = typeof e.scale === "number" ? e.scale : 1;
      const deltaScale = lastScale != null ? scale - lastScale : 0;
      lastScale = scale;
      if (deltaScale === 0) return;
      const deltaY = -deltaScale * 300; // negative -> zoom in
      // Create a synthetic WheelEvent-equivalent object for our handler
      const pseudoWheel = new WheelEvent("wheel", { deltaY });
      handleWheel(pseudoWheel);
    };
    const onGestureEnd: EventListener = (ev) => {
      if (handledNativeEvents.has(ev)) return;
      handledNativeEvents.add(ev);
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
  }, [handleWheel]);

  /*
  replace with app/portals level callback
  useEffect(() => {
    return ctx.subscribe?.(CtxEvent.FovChange, (fov) => setFovOverride(fov));
  }, [ctx]);
  */

  return { rootRef };
}

export default useForwardZoomEventsToCesium;
