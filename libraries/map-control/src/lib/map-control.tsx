import React, { ReactNode, useRef, useState, useEffect } from 'react';
import Control from './components/Control';
import styles from './map-control.module.css';
import Main from './components/Main';

export interface ControlLayoutProps {
  children: ReactNode;
}

export interface ControlProps {
  position: string;
  order?: number;
  id?: string;
  children: React.ReactNode;
}

export interface AllPositions {
  topleft?: ControlProps[];
  topright?: ControlProps[];
  bottomleft?: ControlProps[];
  bottomright?: ControlProps[];
}

const ControlLayout: React.FC<ControlLayoutProps> = ({ children }) => {
  const allPositions: AllPositions = {};
  let mainComponent: React.ReactElement | null = null;

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
      } else if (child.type === Main) {
        mainComponent = React.cloneElement(child);
      }
    }
  });

  return (
    <div className={styles['container']}>
      <div className={styles['controls-container']}>
        <div className={styles['main']}>
          {mainComponent ? mainComponent : null}
        </div>
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

export default ControlLayout;