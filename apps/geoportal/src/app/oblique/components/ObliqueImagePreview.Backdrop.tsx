import { CSSProperties } from "react";

interface BackdropProps {
  fadeIn: boolean;
  isDebug?: boolean;
  color?: string;
  onClick?: () => void;
}

export const Backdrop = ({
  fadeIn,
  isDebug,
  color,
  onClick,
}: BackdropProps) => {
  const filterValue = fadeIn ? "contrast(80%)" : "contrast(100%)";
  const styleObj: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    backdropFilter: filterValue,
    WebkitBackdropFilter: filterValue,
    zIndex: 1100,
    opacity: fadeIn ? 1 : 0,
    transition:
      "opacity 1.2s linear, backdrop-filter 1.2s linear, -webkit-backdrop-filter 1.2s linear",
    cursor: "pointer",
  };
  if (!isDebug && color) {
    styleObj.backgroundColor = color;
  }
  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
  return <div style={styleObj} onClick={onClick} />;
};
