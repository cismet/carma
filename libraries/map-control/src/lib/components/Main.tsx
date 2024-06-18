import React, { ReactNode, useRef, useState, useEffect } from 'react';

export interface MainProps {
  children: ReactNode;
}

const Main: React.FC<MainProps> = ({ children }) => {
  let mainComponent: React.ReactElement | null = null;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      mainComponent = React.cloneElement(child, {
        width: containerWidth,
        height: containerHeight,
      });
    }
  });

  useEffect(() => {
    if (containerRef.current) {
      setContainerHeight(containerRef.current.clientHeight);
      setContainerWidth(containerRef.current.clientWidth);
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
