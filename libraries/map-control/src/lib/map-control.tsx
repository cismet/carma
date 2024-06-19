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
  const containerRef = useRef<HTMLDivElement>(null);
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

  // useEffect(() => {
  //   if (containerRef) {
  //     const containerWidth = containerRef.current?.clientWidth - 30;
  //     let leftWidth = 0;
  //     let rightWidth = 0;
  //     containerRef.current.childNodes.forEach((currentItem) => {
  //       if (currentItem.className.startsWith('_bottom')) {
  //         console.log('www', currentItem.className);

  //         const percent = (currentItem.clientWidth / containerWidth) * 100;
  //         currentItem.style.maxWidth = `calc(${percent}%)`;

  //         if (currentItem.className.includes('left')) {
  //           leftWidth += currentItem.clientWidth;
  //         } else if (currentItem.className.includes('right')) {
  //           rightWidth += currentItem.clientWidth;
  //         }
  //       }
  //     });

  //     console.log('www', leftWidth);
  //     console.log('www rightWidth', rightWidth);
  //     let centerPosition = 0;
  //     containerRef.current.childNodes.forEach((currentItem) => {
  //       if (
  //         currentItem instanceof HTMLElement &&
  //         currentItem.className.startsWith('_bottom') &&
  //         currentItem.className.includes('center')
  //       ) {
  //         const centerWidth = currentItem.clientWidth;
  //         const translateXPercent =
  //           ((centerPosition - centerWidth / 2) / containerWidth) * 100;
  //         console.log('xxx', translateXPercent);
  //         currentItem.style.transform = `translateX(${translateXPercent}%)`;
  //       }
  //     });
  //   }
  // }, [containerRef]);

  useEffect(() => {
    if (containerRef) {
      const containerWidth = containerRef.current?.clientWidth - 30;
      let leftWidth = 0;
      let rightWidth = 0;
      let centerWidth = 0;
      containerRef.current.childNodes.forEach((currentItem) => {
        if (currentItem.className.startsWith('_bottom')) {
          console.log('www', currentItem.className);

          const percent = (currentItem.clientWidth / containerWidth) * 100;
          currentItem.style.maxWidth = `calc(${percent}%)`;

          if (currentItem.className.includes('left')) {
            leftWidth += percent;
          } else if (currentItem.className.includes('right')) {
            rightWidth += percent;
          } else if (currentItem.className.includes('center')) {
            centerWidth += percent;
          }
        }
      });

      let desiredWidth = (2 * (100 - leftWidth - rightWidth)) / 3;

      console.log('www leftWidth', leftWidth);
      console.log('www rightWidth', rightWidth);
      console.log('www centerWidth', centerWidth);
      console.log('www center shift', desiredWidth - centerWidth);

      // containerRef.current.childNodes.forEach((currentItem) => {
      //   if (
      //     currentItem.className.startsWith('_bottom') &&
      //     currentItem.className.includes('center')
      //   ) {
      //     currentItem.style.transform = `translateX(-${
      //       rightWidth + centerWidth
      //     }%)`;
      //   }
      // });
    }
  }, [containerRef]);

  return (
    <div className={styles['container']}>
      <div className={styles['controls-container']} ref={containerRef}>
        {mainComponent ? mainComponent : null}
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
