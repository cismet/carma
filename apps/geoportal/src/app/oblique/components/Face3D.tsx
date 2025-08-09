import React from "react";
import FacadeLabel from "./FacadeLabel";

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
}) => (
  <div
    className={`absolute left-0 top-0 ${className}`}
    style={{
      width,
      height,
      transform,
      transformStyle: "preserve-3d",
      ...(style ?? {}),
    }}
  >
    {showLabel && label ? (
      <FacadeLabel text={label} fontSize={facadeFontSize} />
    ) : null}
    {children}
  </div>
);

export default Face3D;
