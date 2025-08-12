import { CSSProperties } from "react";

interface BackdropProps {
  fadeIn: boolean;
  isDebug?: boolean;
  color?: string;
  onClick?: () => void;
  holeRect?: { x: number; y: number; width: number; height: number };
}

export const Backdrop = ({
  fadeIn,
  isDebug,
  color,
  onClick,
  holeRect,
}: BackdropProps) => {
  const wrapperStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    zIndex: 1100,
    opacity: fadeIn ? 1 : 0,
    transition: "opacity 0.5s linear",
    cursor: "pointer",
  };

  const overlayBase: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    backdropFilter: `contrast(${isDebug ? 85 : 80}%)`,
  };
  if (!isDebug && color) {
    overlayBase.backgroundColor = color;
  }

  if (!holeRect) {
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    return (
      <div style={{ ...wrapperStyle, ...overlayBase }} onClick={onClick} />
    );
  }

  const { x, y, width, height } = holeRect;
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;

  const topShade: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: Math.max(0, y),
    ...overlayBase,
  };
  const bottomShade: CSSProperties = {
    position: "absolute",
    left: 0,
    top: Math.max(0, y + height),
    width: "100%",
    height: Math.max(0, vh - (y + height)),
    ...overlayBase,
  };
  const leftShade: CSSProperties = {
    position: "absolute",
    left: 0,
    top: Math.max(0, y),
    width: Math.max(0, x),
    height: Math.max(0, height),
    ...overlayBase,
  };
  const rightShade: CSSProperties = {
    position: "absolute",
    left: Math.max(0, x + width),
    top: Math.max(0, y),
    width: Math.max(0, vw - (x + width)),
    height: Math.max(0, height),
    ...overlayBase,
  };

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div style={wrapperStyle} onClick={onClick}>
      <div style={topShade} />
      <div style={bottomShade} />
      <div style={leftShade} />
      <div style={rightShade} />
    </div>
  );
};
