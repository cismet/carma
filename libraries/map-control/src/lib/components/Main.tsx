import React, { ReactNode, useRef, useState, useEffect } from 'react';

export interface MainProps {
  children: ReactNode;
  typeOfMap?: string;
}

const Main: React.FC<MainProps> = ({ children, typeOfMap }) => {
  let mainComponent: React.ReactElement | null = null;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      console.log('yyy container mainComponent', child.type);
      mainComponent = React.cloneElement(child, {
        mapStyle: { width: '100%', height: `${containerHeight}px` },
      });
    }
  });

  useEffect(() => {
    if (containerRef.current) {
      setContainerHeight(containerRef.current.clientHeight);
    }
  }, [containerRef.current]);

  useEffect(() => {}, [containerHeight]);
  return (
    <div
      ref={containerRef}
      style={{ border: '1px solid red', width: '100%', height: '100%' }}
    >
      {mainComponent ? mainComponent : null}
      {/* {children} */}
    </div>
  );
};

export default Main;
