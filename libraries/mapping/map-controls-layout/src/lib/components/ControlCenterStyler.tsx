import React, { ReactNode } from "react";
import { DEFAULT_CONTROL_STYLE_OPTIONS } from "./control-styles";

interface ControlCenterStylerProps {
  children: ReactNode;
}

const ControlCenterStyler: React.FC<ControlCenterStylerProps> = ({
  children,
}) => {
  return <div style={DEFAULT_CONTROL_STYLE_OPTIONS.center.root}>{children}</div>;
};

export default ControlCenterStyler;
