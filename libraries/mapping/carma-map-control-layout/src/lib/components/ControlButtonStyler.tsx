import React, { CSSProperties, ReactNode } from 'react';

interface ControlButtonStylerProps {
  children: ReactNode;
  width?: string;
  height?: string;
  fontSize?: string;
  singleButtonClick?: () => void;
}

const ControlButtonStyler: React.FC<ControlButtonStylerProps> = ({
  children,
  width = '34px',
  height = '34px',
  fontSize = '18px',
  singleButtonClick = () => {},
}) => {
  const iconPadding = {
    backgroundColor: '#fff',
    border: '2px solid rgba(0, 0, 0, .3)',
    borderRadius: '4px',
    width,
    height,
    textAlign: 'center', 
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    fontSize,
    // fontWeight: 700,
  } as CSSProperties;
  return (
    <button style={iconPadding} onClick={singleButtonClick}>
      {children}
    </button>
  );
};

export default ControlButtonStyler;
