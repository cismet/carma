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
  const styleObj: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    backdropFilter: `contrast(${isDebug ? 85 : 80}%)`,
    zIndex: 1100,
    opacity: fadeIn ? 1 : 0,
    transition: "opacity 0.5s linear",
    cursor: "pointer",
  };

  if (!isDebug && color) {
    styleObj.backgroundColor = color;
  }

  // Additional functionality: the overlay can also be closed by a button in the parent component.
  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
  return <div style={styleObj} onClick={onClick} />;
};
