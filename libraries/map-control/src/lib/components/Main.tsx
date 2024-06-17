import React, { ReactNode } from 'react';

export interface MainProps {
  children: ReactNode;
  typeOfMap?: string;
}

const Main: React.FC<MainProps> = ({ children, typeOfMap }) => {
  return <>{children}</>;
};

export default Main;
