import React, { ReactNode } from 'react';
import Control from './Control';
import styles from '../map-control.module.css';
import Main from './Main';

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

const ControlLayoutBasic: React.FC<ControlLayoutProps> = ({ children }) => {
  const allPositions: AllPositions = {};
  const mainComponent: React.ReactNode[] = [];

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      if (child.type === Control) {
        const { position, order = 0, id } = child.props as ControlProps;
        if (!allPositions[position]) {
          allPositions[position] = [];
        }
        allPositions[position]?.push({ ...child.props, order, id });
        allPositions[position]
          .sort((a, b) => {
            const orderA = a.order;
            const orderB = b.order;
            if (orderA < orderB) {
              return -1;
            }
            if (orderA > orderB) {
              return 1;
            }

            return 0;
          })
          .reverse();
      } else {
        mainComponent.push(child);
      }
    }
  });

  return (
    <div className={styles['container']}>
      <div className={styles['main']}>{mainComponent}</div>
      <div className={styles['controls-container']}>
        {Object.keys(allPositions).map((position) => {
          return (
            <div className={styles[position]}>
              {allPositions[position].map((component, idx) => {
                return (
                  <div className={styles['control-item']}>
                    <Control {...component} key={idx} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ControlLayoutBasic;
