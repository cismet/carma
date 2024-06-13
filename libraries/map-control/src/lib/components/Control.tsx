import React, { ReactNode } from 'react';

interface ControlProps {
  position: string;
  order: number;
  children: ReactNode;
}

const Control: React.FC<ControlProps> = ({ position, order, children }) => {
  return <>{children}</>;
};

export default Control;
