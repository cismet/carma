export const preventPinchZoom = (): void => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  window.addEventListener(
    "wheel",
    (e) => {
      if ((e as WheelEvent).ctrlKey) e.preventDefault();
    },
    { passive: false }
  );

  const prevent = (e: Event) => e.preventDefault();

  document.addEventListener("gesturestart", prevent);
  document.addEventListener("gesturechange", prevent);
  document.addEventListener("gestureend", prevent);
};
