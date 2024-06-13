import React, { ReactNode } from 'react';

interface ControlLayoutProps {
  children: ReactNode;
}

const ControlLayout: React.FC<ControlLayoutProps> = ({ children }) => {
  return <div>{children}</div>;
};

export default ControlLayout;
