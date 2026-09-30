import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type PointerEvent,
} from "react";

export const LONG_PRESS_MS = 500;

/** how far the finger may wander before the press counts as a scroll */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

/**
 * A tap and a long press on the same element. The long press swallows the
 * click the browser sends when the finger lifts.
 *
 * `pointercancel` does not end the press: iPhone Safari runs its own long
 * press at the same half second and cancels the pointer when that one wins,
 * with the finger still down and unmoved. What ends it is lifting the finger,
 * moving it, or the page scrolling, which is what a cancel from a pan brings.
 */
export const useTapOrLongPress = (
  onTap: () => void,
  onLongPress: () => void
) => {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  // one function for the whole life of the element, so the scroll listener
  // it adds can be taken off again
  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
    window.removeEventListener("scroll", cancel, true);
  }, []);

  useEffect(() => cancel, [cancel]);

  return {
    onPointerDown: (event: PointerEvent) => {
      firedRef.current = false;
      cancel();
      startRef.current = { x: event.clientX, y: event.clientY };
      // capture: a scroll of any scroller on the page counts, too
      window.addEventListener("scroll", cancel, {
        capture: true,
        passive: true,
      });
      timerRef.current = window.setTimeout(() => {
        cancel();
        firedRef.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event: PointerEvent) => {
      const start = startRef.current;
      if (
        start &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) >
          LONG_PRESS_MOVE_TOLERANCE_PX
      ) {
        cancel();
      }
    },
    onPointerUp: cancel,
    // a finger's cancel is followed by a leave; only a mouse really leaves
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        cancel();
      }
    },
    // the long press would otherwise open the phone's own menu
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
    onClick: () => {
      if (firedRef.current) {
        firedRef.current = false;
        return;
      }
      onTap();
    },
  };
};
