import React, { ReactNode } from 'react';

interface ControlProps {
  position: string;
  order: number;
  fullCollapseWidth?: boolean;
  children: ReactNode;
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
