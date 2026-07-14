export const POINTER_DRAG_SESSION_END_REASONS = {
  RELEASE: "release",
  BLUR: "blur",
  VISIBILITY: "visibility",
} as const;

export type PointerDragSessionEndReason =
  (typeof POINTER_DRAG_SESSION_END_REASONS)[keyof typeof POINTER_DRAG_SESSION_END_REASONS];

export type PointerDragSessionOptions = {
  onMove: (event: MouseEvent) => void;
  onEnd: (info: { reason: PointerDragSessionEndReason }) => void;
};

export type PointerDragSession = {
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
  const handlePointerUp = () =>
    onEnd({ reason: POINTER_DRAG_SESSION_END_REASONS.RELEASE });
  const handleBlur = () =>
    onEnd({ reason: POINTER_DRAG_SESSION_END_REASONS.BLUR });
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      return;
    }
    onEnd({ reason: POINTER_DRAG_SESSION_END_REASONS.VISIBILITY });
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
