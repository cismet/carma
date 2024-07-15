import React, { ReactNode } from 'react';

export interface ControlProps {
  position: string;
  order: number;
  fullCollapseWidth?: boolean;
  children: ReactNode;
  bottomLeftWidth?: number;
  bottomRightWidth?: number;
}

const Control: React.FC<ControlProps> = ({
  position,
  order,
  children,
  fullCollapseWidth = false,
  bottomLeftWidth = 300,
  bottomRightWidth = 300,
}) => {
  return <>{children}</>;
};

export default Control;
