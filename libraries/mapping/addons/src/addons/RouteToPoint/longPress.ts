import type { Map as MaplibreMap } from "maplibre-gl";

import { LONG_PRESS_SLOP_PX } from "./config";

/**
 * Calls back with the map position of a long press: a finger or a mouse button
 * held still on the map for `delayMs`, or a right-click. Returns the way to
 * undo all of it.
 *
 * Only presses on the canvas count: a press on a popup, a marker or a control
 * is theirs. A press that moves is a pan, a second finger a pinch; both cancel.
 *
 * The click that follows a long press is caught on the map's container while
 * it goes down and stopped there, so the map does not also pick the feature
 * under the finger, and the popup that the long press just opened is not
 * closed again by it.
 *
 * A right-click opens it as well, unless the mouse moved between down and up:
 * a right-drag rotates the map, and on Windows the context menu event comes
 * at the end of it.
 */
export const onLongPress = (
  map: MaplibreMap,
  delayMs: number,
  onPress: (at: [number, number]) => void
) => {
  const container = map.getContainer();
  const canvas = map.getCanvas();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pressedAt: { x: number; y: number } | null = null;
  /** the pointers down right now; a second one is a pinch */
  const pointers = new Set<number>();
  /** until when a click is the tail of a long press */
  let swallowClicksUntil = 0;
  /** when the last long press fired, so a context menu right after it is not a second */
  let firedAt = 0;

  const lngLatOf = (clientX: number, clientY: number): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const { lng, lat } = map.unproject([
      clientX - rect.left,
      clientY - rect.top,
    ]);
    return [lng, lat];
  };

  const fire = (clientX: number, clientY: number) => {
    firedAt = Date.now();
    swallowClicksUntil = firedAt + 1000;
    onPress(lngLatOf(clientX, clientY));
  };

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const moved = (event: PointerEvent | MouseEvent) =>
    pressedAt !== null &&
    Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) >
      LONG_PRESS_SLOP_PX;

  const handleDown = (event: PointerEvent) => {
    pointers.add(event.pointerId);
    cancel();
    pressedAt = { x: event.clientX, y: event.clientY };
    if (event.target !== canvas || pointers.size > 1 || event.button !== 0) {
      return;
    }
    const { clientX, clientY } = event;
    timer = setTimeout(() => {
      timer = null;
      fire(clientX, clientY);
    }, delayMs);
  };
  const handleMove = (event: PointerEvent) => {
    if (timer !== null && moved(event)) {
      cancel();
    }
  };
  // on the window: a finger lifted off the map still ends its press
  const handleUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    cancel();
  };
  const handleContextMenu = (event: MouseEvent) => {
    if (event.target !== canvas) {
      return;
    }
    // the browser's own menu has nothing to offer on a map
    event.preventDefault();
    if (Date.now() - firedAt < 1000 || moved(event)) {
      return;
    }
    cancel();
    fire(event.clientX, event.clientY);
  };
  const handleClick = (event: MouseEvent) => {
    if (Date.now() < swallowClicksUntil) {
      swallowClicksUntil = 0;
      event.stopPropagation();
      event.preventDefault();
    }
  };

  container.addEventListener("pointerdown", handleDown, true);
  container.addEventListener("pointermove", handleMove, true);
  window.addEventListener("pointerup", handleUp, true);
  window.addEventListener("pointercancel", handleUp, true);
  container.addEventListener("contextmenu", handleContextMenu, true);
  container.addEventListener("click", handleClick, true);
  return () => {
    cancel();
    container.removeEventListener("pointerdown", handleDown, true);
    container.removeEventListener("pointermove", handleMove, true);
    window.removeEventListener("pointerup", handleUp, true);
    window.removeEventListener("pointercancel", handleUp, true);
    container.removeEventListener("contextmenu", handleContextMenu, true);
    container.removeEventListener("click", handleClick, true);
  };
};
