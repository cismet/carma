import React, { ReactNode } from 'react';

interface ControlProps {
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
}) => {
  return <>{children}</>;
};

export default Control;
