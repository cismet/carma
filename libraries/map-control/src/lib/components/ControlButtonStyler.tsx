import React, { ReactNode, useRef, useState, useEffect } from 'react';

interface ControlButtonStylerProps {
  children: ReactNode;
}

const iconPadding = {
  backgroundColor: '#fff',
  border: '2px solid rgba(0, 0, 0, .23)',
  borderRadius: '4px',
  width: '34px',
  height: '34px',
  textAlign: 'center',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '18px',
};

const ControlButtonStyler: React.FC<ControlButtonStylerProps> = ({
  children,
}) => {
  return <div style={iconPadding}>{children}</div>;
};

export default ControlButtonStyler;
