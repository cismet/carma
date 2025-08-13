import { CSSProperties } from "react";

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
  const filterValue = `contrast(${contrast}%) brightness(${brightness}%) saturate(${saturation}%)`;
  const styleObj: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    backdropFilter: filterValue,
    WebkitBackdropFilter: filterValue,
    zIndex: 1100,
    opacity: 1,
    transition:
      "backdrop-filter 1.2s linear, -webkit-backdrop-filter 1.2s linear",
    cursor: interactive ? "pointer" : "default",
    pointerEvents: interactive ? "auto" : "none",
  };
  if (!isDebug && color) {
    styleObj.backgroundColor = color;
  }
  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
  return <div style={styleObj} onClick={onClick} />;
};
