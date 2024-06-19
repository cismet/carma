import React, { useState, useEffect } from 'react';

type ResizeableContainer = {
  minLeft?: number;
  minRight?: number;
  start?: number;
  children?: React.ReactNode;
  enableDragging?: boolean;
};

// TODO Remove this and replace component with topicmap

export const ResizeableContainer = ({
  minLeft = 0,
  minRight = 1.5,
  start = 2,
  enableDragging = true,
  children,
}: ResizeableContainer) => {
  const [iframePadding, setIframePadding] = useState(start);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const pad = (e.clientX / window.innerWidth) * 100;
      setIframePadding(Math.max(minLeft, Math.min(100 - minRight, pad)));
    }
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: `${iframePadding}vw`,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          left: `-${iframePadding}vw`,
          height: '100vh',
          width: '100vw',
        }}
      >
        {children}
      </div>
      {enableDragging && (
        <div
          onMouseDown={handleMouseDown}
          style={{
            position: 'absolute',
            pointerEvents: 'auto',
            top: 0,
            left: 0,
            zIndex: 101,
            width: '20px',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            cursor: 'ew-resize',
          }}
        />
      )}
    </div>
  );
};

export default ResizeableContainer;
