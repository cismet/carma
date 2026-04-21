export const preventPinchZoom = (): (() => void) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const handleWheel = (event: WheelEvent) => {
    if (event.ctrlKey) {
      event.preventDefault();
    }
  };
  const handleGesture = (event: Event) => {
    event.preventDefault();
  };
  const handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  };

  window.addEventListener("wheel", handleWheel, { passive: false });
  document.addEventListener("gesturestart", handleGesture, {
    passive: false,
  });
  document.addEventListener("gesturechange", handleGesture, {
    passive: false,
  });
  document.addEventListener("gestureend", handleGesture, { passive: false });
  document.addEventListener("touchmove", handleTouchMove, {
    passive: false,
  });

  return () => {
    window.removeEventListener("wheel", handleWheel);
    document.removeEventListener("gesturestart", handleGesture);
    document.removeEventListener("gesturechange", handleGesture);
    document.removeEventListener("gestureend", handleGesture);
    document.removeEventListener("touchmove", handleTouchMove);
  };
};
