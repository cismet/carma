import React, { ReactNode, useRef, useState, useEffect } from 'react';

interface ControlButtonStylerProps {
  children: ReactNode;
  width?: string;
  height?: string;
  fontSize?: string;
}

const ControlButtonStyler: React.FC<ControlButtonStylerProps> = ({
  children,
  width = '35px',
  height = '35px',
  fontSize = '18px',
}) => {
  const iconPadding = {
    backgroundColor: '#fff',
    border: '2px solid rgba(0, 0, 0, .23)',
    borderRadius: '4px',
    width,
    height,
    textAlign: 'center',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize,
  };
  return <div style={iconPadding}>{children}</div>;
};

export default ControlButtonStyler;
