/**
 * RUNTIME WORKAROUND: map "click" for jittery touch taps (Apple Pencil).
 * Nothing in `node_modules/maplibre-gl` is changed.
 *
 * WHY
 * MapLibre only fires its "click" from the DOM click event. Its TouchPanHandler
 * calls preventDefault() on every single-finger touchmove
 * (maplibre-gl `src/ui/handler/touch_pan.ts`), and iOS then drops the
 * synthesized click. A pen tap always jitters a few pixels, so on an iPad with
 * the pencil no map click arrived: feature selection, point info etc. were dead.
 *
 * WHAT THIS DOES
 * For a single touch on the canvas that stayed within TAP_TOLERANCE_PX and had
 * a touchmove cancelled by MapLibre, fires the map "click" itself on touchend.
 * A native click a browser might still send for that tap is swallowed, so
 * consumers never see two clicks.
 *
 * Written against maplibre-gl 5.18.0, recheck after a MapLibre upgrade.
 */
import { MapMouseEvent } from "maplibre-gl";
import type maplibregl from "maplibre-gl";

const TAP_TOLERANCE_PX = 10;
const NATIVE_CLICK_WINDOW_MS = 500;

export const installTouchTapClick = (map: maplibregl.Map): void => {
  const container = map.getCanvasContainer();
  const canvas = map.getCanvas();
  let start: { x: number; y: number } | null = null;
  let panCancelledClick = false;
  let swallowClickUntil = 0;

  const onTouchStart = (e: TouchEvent) => {
    swallowClickUntil = 0;
    panCancelledClick = false;
    const touch = e.touches[0];
    start =
      e.touches.length === 1 && e.target === canvas
        ? { x: touch.clientX, y: touch.clientY }
        : null;
  };

  // Registered after MapLibre's own touchmove listener on the same element,
  // so defaultPrevented already reflects what its pan handler did.
  const onTouchMove = (e: TouchEvent) => {
    if (!start) {
      return;
    }
    const touch = e.touches[0];
    if (
      e.touches.length !== 1 ||
      Math.hypot(touch.clientX - start.x, touch.clientY - start.y) >
        TAP_TOLERANCE_PX
    ) {
      start = null;
      return;
    }
    if (e.defaultPrevented) {
      panCancelledClick = true;
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    const tapped = start && panCancelledClick && e.touches.length === 0;
    start = null;
    if (!tapped) {
      return;
    }
    const touch = e.changedTouches[0];
    swallowClickUntil = performance.now() + NATIVE_CLICK_WINDOW_MS;
    map.fire(
      new MapMouseEvent("click", map, {
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as MouseEvent)
    );
  };

  const onTouchCancel = () => {
    start = null;
  };

  // Capture phase on the container runs before MapLibre's bubble listener.
  const onClickCapture = (e: MouseEvent) => {
    if (performance.now() < swallowClickUntil) {
      swallowClickUntil = 0;
      e.stopPropagation();
    }
  };

  container.addEventListener("touchstart", onTouchStart, { passive: true });
  container.addEventListener("touchmove", onTouchMove, { passive: true });
  container.addEventListener("touchend", onTouchEnd);
  container.addEventListener("touchcancel", onTouchCancel);
  container.addEventListener("click", onClickCapture, true);

  map.once("remove", () => {
    container.removeEventListener("touchstart", onTouchStart);
    container.removeEventListener("touchmove", onTouchMove);
    container.removeEventListener("touchend", onTouchEnd);
    container.removeEventListener("touchcancel", onTouchCancel);
    container.removeEventListener("click", onClickCapture, true);
  });
};
