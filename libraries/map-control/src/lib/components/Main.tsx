import React, { ReactNode } from 'react';

interface MainProps {
  children: ReactNode;
}

const Main: React.FC<MainProps> = () => {
  return <>{children}</>;
};

export default Main;
