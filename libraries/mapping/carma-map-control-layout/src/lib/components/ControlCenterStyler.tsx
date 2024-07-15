import React, { ReactNode, useRef, useState, useEffect } from 'react';

interface ControlCenterStylerProps {
  children: ReactNode;
}

const ControlCenterStyler: React.FC<ControlCenterStylerProps> = ({
  children,
}) => {
  const styles = {
    backgroundColor: '#fff',
    border: 'none',
    opacity: 0.9,
    width: '100%',
    maxWidth: '100%',
    height: '100%',
    textAlign: 'center' as 'center',
    padding: '5px 4px',
    display: 'flex',
    flexDirection: 'column' as 'column',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  };

  return <div style={styles}>{children}</div>;
};

export default ControlCenterStyler;
