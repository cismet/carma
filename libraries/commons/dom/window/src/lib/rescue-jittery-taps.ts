/**
 * Page-wide click rescue for jittery touch taps (Apple Pencil).
 *
 * WHY
 * iOS drops the synthesized click of a tap once one of its touchmoves was
 * preventDefault()ed. A pen tap always jitters a few pixels, and several
 * libraries cancel every touchmove, so those taps did nothing:
 * - MapLibre's TouchPanHandler: no map click (feature selection, point info)
 * - rc-virtual-list in antd Select/AutoComplete dropdowns: gazetteer hits
 *
 * WHAT THIS DOES
 * For a single-touch tap that stayed within TAP_TOLERANCE_PX and had a
 * touchmove cancelled, dispatches a click on the touched element at touchend.
 * A native click a browser might still send for that tap is swallowed once.
 * A touchend that was itself preventDefault()ed is left alone (that handler
 * wants no click).
 */

const TAP_TOLERANCE_PX = 10;
const NATIVE_CLICK_WINDOW_MS = 500;

let installed = false;

export const rescueJitteryTaps = (): void => {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;

  let start: { x: number; y: number; target: EventTarget | null } | null =
    null;
  let moveCancelled = false;
  let swallowClickUntil = 0;

  const onTouchStart = (e: TouchEvent) => {
    swallowClickUntil = 0;
    moveCancelled = false;
    const touch = e.touches[0];
    start =
      e.touches.length === 1
        ? { x: touch.clientX, y: touch.clientY, target: e.target }
        : null;
  };

  // Bubble phase on window runs after the element's own listeners,
  // so defaultPrevented already reflects what they did.
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
      moveCancelled = true;
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    const tap = start;
    start = null;
    if (
      !tap ||
      !moveCancelled ||
      e.touches.length !== 0 ||
      e.defaultPrevented ||
      !(tap.target instanceof Element) ||
      !tap.target.isConnected
    ) {
      return;
    }
    const touch = e.changedTouches[0];
    tap.target.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        detail: 1,
        clientX: touch.clientX,
        clientY: touch.clientY,
        screenX: touch.screenX,
        screenY: touch.screenY,
      })
    );
    // set after dispatching, so our own click is not swallowed
    swallowClickUntil = performance.now() + NATIVE_CLICK_WINDOW_MS;
  };

  const onTouchCancel = () => {
    start = null;
  };

  const onClickCapture = (e: MouseEvent) => {
    if (performance.now() < swallowClickUntil) {
      swallowClickUntil = 0;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  window.addEventListener("touchstart", onTouchStart, {
    capture: true,
    passive: true,
  });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", onTouchEnd);
  window.addEventListener("touchcancel", onTouchCancel, { capture: true });
  window.addEventListener("click", onClickCapture, { capture: true });
};
