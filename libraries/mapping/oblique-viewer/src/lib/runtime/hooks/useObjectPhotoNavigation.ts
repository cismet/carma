import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import type {
  ObjectCoverageCrop,
  ObjectCoverageImage,
  ObjectCoverageSphere,
} from "../../core/utils/object-coverage";
import {
  panObjectCoverageView,
  zoomObjectCoverageView,
  type ObjectCoverageView,
} from "../../core/utils/object-coverage-navigation";

type Options = {
  image: ObjectCoverageImage;
  sphere: ObjectCoverageSphere;
  crop: ObjectCoverageCrop;
  view: ObjectCoverageView;
  enabled: boolean;
  onChange: (view: ObjectCoverageView) => void;
  onActivate: () => void;
};

/** Coalesce input without reopening image leases or querying the scene per move. */
export const useObjectPhotoNavigation = (options: Options) => {
  const latest = useRef(options);
  latest.current = options;
  const pointer = useRef<{
    id: number;
    start: { x: number; y: number };
    last: { x: number; y: number };
    next: { x: number; y: number };
    element: HTMLDivElement;
    dragged: boolean;
  } | null>(null);
  const frame = useRef<{ id: number; owner: Window } | null>(null);
  const suppressClick = useRef(false);
  const surface = useRef<HTMLDivElement | null>(null);
  const nativeWheelListener = useRef<
    ((event: globalThis.WheelEvent) => void) | null
  >(null);
  const native = (point: { x: number; y: number }, element: HTMLDivElement) => {
    const box = element.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return null;
    const { crop } = latest.current;
    return {
      x: crop.x + ((point.x - box.left) * crop.width) / box.width,
      y: crop.y + ((point.y - box.top) * crop.height) / box.height,
    };
  };
  const flush = () => {
    frame.current = null;
    const drag = pointer.current;
    if (!drag?.dragged || !latest.current.enabled) return;
    const from = native(drag.last, drag.element),
      to = native(drag.next, drag.element);
    drag.last = { ...drag.next };
    if (!from || !to) return;
    const { image, sphere, crop, view, onChange } = latest.current;
    const next = panObjectCoverageView(image, sphere, crop, view, from, to);
    if (next && next !== view) onChange(next);
  };
  const cancelFrame = () => {
    if (frame.current)
      frame.current.owner.cancelAnimationFrame(frame.current.id);
    frame.current = null;
  };
  const release = () => {
    const drag = pointer.current;
    pointer.current = null;
    if (drag?.element.hasPointerCapture?.(drag.id))
      drag.element.releasePointerCapture(drag.id);
    drag?.element.style.removeProperty("cursor");
  };
  useEffect(
    () => () => {
      cancelFrame();
      release();
    },
    []
  );
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (
      !latest.current.enabled ||
      event.button !== 0 ||
      event.isPrimary === false ||
      pointer.current
    )
      return;
    latest.current.onActivate();
    suppressClick.current = false;
    const point = { x: event.clientX, y: event.clientY };
    pointer.current = {
      id: event.pointerId,
      start: point,
      last: point,
      next: point,
      element: event.currentTarget,
      dragged: false,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = pointer.current;
    if (!drag || drag.id !== event.pointerId) return;
    const next = { x: event.clientX, y: event.clientY };
    if (
      !drag.dragged &&
      Math.hypot(next.x - drag.start.x, next.y - drag.start.y) < 3
    )
      return;
    if (!drag.dragged) {
      drag.dragged = true;
      drag.element.setPointerCapture?.(drag.id);
      drag.element.style.cursor = "grabbing";
    }
    drag.next = next;
    event.preventDefault();
    event.stopPropagation();
    if (!frame.current) {
      const owner = drag.element.ownerDocument.defaultView;
      if (owner)
        frame.current = { owner, id: owner.requestAnimationFrame(flush) };
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current?.id !== event.pointerId) return;
    const dragged = pointer.current.dragged;
    cancelFrame();
    flush();
    release();
    suppressClick.current = dragged;
  };
  const onPointerCancel = () => {
    cancelFrame();
    release();
    suppressClick.current = true;
  };
  const onWheel = (event: globalThis.WheelEvent) => {
    const element = surface.current;
    if (!element || !latest.current.enabled) return;
    event.preventDefault();
    event.stopPropagation();
    latest.current.onActivate();
    cancelFrame();
    flush();
    const pixel = native({ x: event.clientX, y: event.clientY }, element);
    if (!pixel) return;
    const { image, sphere, crop, view, onChange } = latest.current;
    const unit =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
        ? element.clientHeight
        : 1;
    const factor = Math.exp(
      -Math.max(-200, Math.min(200, event.deltaY * unit)) / 500
    );
    const next = zoomObjectCoverageView(
      image,
      sphere,
      crop,
      view,
      pixel,
      factor
    );
    if (next && next !== view) onChange(next);
  };
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;
  const attachSurface = useCallback((element: HTMLDivElement | null) => {
    if (surface.current && nativeWheelListener.current)
      surface.current.removeEventListener("wheel", nativeWheelListener.current);
    surface.current = element;
    if (!element) return;
    const listener = (event: globalThis.WheelEvent) => wheelRef.current(event);
    nativeWheelListener.current = listener;
    element.addEventListener("wheel", listener, { passive: false });
  }, []);
  useEffect(() => {
    const element = surface.current,
      listener = nativeWheelListener.current;
    if (element && listener)
      element.addEventListener("wheel", listener, { passive: false });
    return () => {
      if (element && listener) element.removeEventListener("wheel", listener);
    };
  }, []);
  return {
    attachSurface,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture: onPointerCancel,
    consumeDragClick: () => {
      const value = suppressClick.current;
      suppressClick.current = false;
      return value;
    },
  };
};
