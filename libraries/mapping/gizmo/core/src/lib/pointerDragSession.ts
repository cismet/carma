// Window-level pointer drag session (cismet/wupp#4078).
//
// A drag that starts on an element but must keep tracking the pointer anywhere
// (and end on release / focus loss / tab switch) needs the same window-level
// listener set every time. This helper owns that lifecycle so callers only
// supply the per-drag move handler and an end handler, instead of re-wiring
// mousemove/mouseup/pointerup/blur/visibilitychange + their teardown by hand.

export type PointerDragSessionEndReason = "pointerup" | "blur" | "visibility";

export type PointerDragSessionOptions = {
  // Called on every window mousemove for the duration of the drag.
  onMove: (event: MouseEvent) => void;
  // Called once when the drag ends. `reason` distinguishes a real release
  // (`pointerup`) from an interruption (window blur / tab hidden), so callers
  // can e.g. suppress a trailing click only on a genuine release.
  onEnd: (info: { reason: PointerDragSessionEndReason }) => void;
};

export type PointerDragSession = {
  // Remove all listeners. Safe to call more than once.
  cleanup: () => void;
};

export const beginPointerDragSession = ({
  onMove,
  onEnd,
}: PointerDragSessionOptions): PointerDragSession => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { cleanup: () => undefined };
  }

  const handleMouseMove = (event: MouseEvent) => onMove(event);
  const handlePointerUp = () => onEnd({ reason: "pointerup" });
  const handleBlur = () => onEnd({ reason: "blur" });
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      return;
    }
    onEnd({ reason: "visibility" });
  };

  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handlePointerUp);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("blur", handleBlur);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return {
    cleanup: () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    },
  };
};
