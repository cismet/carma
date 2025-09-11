import { CSSProperties } from "react";
import type React from "react";
import { useForwardZoomEventsToCesium } from "../hooks/useForwardZoomEventsToCesium";

interface BackdropProps {
  contrast: number; // %
  brightness?: number; // %
  saturation?: number; // %
  isDebug?: boolean;
  color?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export const Backdrop = ({
  contrast,
  brightness = 100,
  saturation = 100,
  isDebug,
  color,
  onClick,
  interactive = true,
}: BackdropProps) => {
  const { rootRef, onWheel } = useForwardZoomEventsToCesium();
  const filterValue = `contrast(${contrast}%) brightness(${brightness}%) saturate(${saturation}%)`;
  const styleObj: CSSProperties = {
    WebkitBackdropFilter: filterValue,
    backdropFilter: filterValue,
    cursor: interactive ? "pointer" : "default",
    height: "100vh",
    left: 0,
    opacity: 1,
    pointerEvents: interactive ? "auto" : "none",
    position: "fixed",
    top: 0,
    touchAction: "none", // Ensure the browser doesn't perform page-level pinch zoom; we'll forward to Cesium instead
    transition:
      "backdrop-filter 1.2s linear, -webkit-backdrop-filter 1.2s linear",
    width: "100vw",
    zIndex: 1100,
  };
  if (!isDebug && color) {
    styleObj.backgroundColor = color;
  }
  // Wheel and pinch gestures are forwarded by the hook via rootRef + onWheel

  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (!onClick) return;
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      ref={rootRef}
      style={styleObj}
      role="button"
      tabIndex={0}
      aria-label="Close preview"
      onClick={onClick}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
    />
  );
};
