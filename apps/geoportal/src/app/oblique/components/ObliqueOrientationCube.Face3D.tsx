import React from "react";
import FacadeLabel from "./ObliqueOrientationCube.FacadeLabel";

export type Face3DProps = {
  className?: string;
  transform: string;
  width: number;
  height: number;
  label?: string;
  showLabel?: boolean;
  facadeFontSize: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  onClick?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  role?: React.AriaRole;
  tabIndex?: number;
  ariaLabel?: string;
};

const Face3D: React.FC<Face3DProps> = ({
  className = "",
  transform,
  width,
  height,
  label,
  showLabel = false,
  facadeFontSize,
  style,
  children,
  onClick,
  onKeyDown,
  onMouseDown,
  onMouseUp,
  onMouseEnter,
  onMouseLeave,
  role,
  tabIndex,
  ariaLabel,
}) => (
  <div
    className={`absolute left-0 top-0 select-none ${className}`}
    style={{
      width,
      height,
      transform,
      transformStyle: "preserve-3d",
      ...(style ?? {}),
    }}
    onClick={onClick}
    onKeyDown={onKeyDown}
    onMouseDown={onMouseDown}
    onMouseUp={onMouseUp}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
    role={role}
    tabIndex={tabIndex}
    aria-label={ariaLabel}
  >
    {showLabel && label ? (
      <FacadeLabel text={label} fontSize={facadeFontSize} />
    ) : null}
    {children}
  </div>
);

export default Face3D;
