import React, { ReactNode } from 'react';
import Control from './Control';
import styles from '../map-control.module.css';

interface ControlLayoutProps {
  children: ReactNode;
}

interface ControlProps {
  position: string;
  order?: number;
  id?: string;
  children: React.ReactNode;
}

interface AllPositions {
  topleft?: ControlProps[];
  topright?: ControlProps[];
  bottomleft?: ControlProps[];
  bottomright?: ControlProps[];
}

const ControlLayout: React.FC<ControlLayoutProps> = ({ children }) => {
  const allPositions: AllPositions = {};

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      if (child.type === Control) {
        const { position, order = 0, id } = child.props as ControlProps;
        if (!allPositions[position]) {
          allPositions[position] = [];
        }
        allPositions[position]?.push({ ...child.props, order, id });
      }
    }
  });

  console.log('xxx', allPositions);

  return (
    <div>
      {Object.keys(allPositions).map((position) => {
        return (
          <div className={styles[position]}>
            {allPositions[position].map((component, idx) => {
              return <Control {...component} key={idx} />;
            })}
          </div>
        );
      })}
    </div>
  );
};

export default ControlLayout;
