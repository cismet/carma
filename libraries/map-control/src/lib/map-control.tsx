import React, { ReactNode, useRef, useState, useEffect } from 'react';
import Control from './components/Control';
import styles from './map-control.module.css';
import Main from './components/Main';

export interface ControlLayoutProps {
  children: ReactNode;
  onResponsiveCollapse?: Function;
  debugMode?: boolean;
}

export interface ControlProps {
  position: string;
  order?: number;
  id?: string;
  fullCollapseWidth?: boolean;
  children: React.ReactNode;
  bottomLeftWidth?: number;
  bottomRightWidth?: number;
}

export interface AllPositions {
  topleft?: ControlProps[];
  topright?: ControlProps[];
  bottomleft?: ControlProps[];
  bottomright?: ControlProps[];
}

const ControlLayout: React.FC<ControlLayoutProps> = ({
  children,
  onResponsiveCollapse = () => console.log(),
  debugMode = false,
}) => {
  const [windowWidth, setWindowWidth] = useState(0);
  const [screenSizeWatcher, setScreenSizeWatcher] = useState('');
  const allPositions: AllPositions = {};
  let mainComponent: React.ReactElement | null = null;
  const containerRef = useRef<HTMLDivElement>(null);
  let bottomLeftBiggestWidth = 0;
  let bottomRightBiggestWidth = 0;
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      if (child.type === Control) {
        const {
          position,
          order = 0,
          id,
          fullCollapseWidth,
          bottomLeftWidth,
          bottomRightWidth,
        } = child.props as ControlProps;
        if (!allPositions[position]) {
          allPositions[position] = [];
        }
        allPositions[position]?.push({
          ...child.props,
          order,
          id,
          fullCollapseWidth,
        });

        console.log('www right', bottomRightWidth);
        console.log('www left', bottomLeftWidth);
        if (bottomLeftWidth) {
          bottomLeftBiggestWidth =
            bottomLeftWidth > bottomLeftBiggestWidth
              ? bottomLeftWidth
              : bottomLeftBiggestWidth;
        }
        if (bottomRightWidth) {
          bottomRightBiggestWidth =
            bottomRightWidth > bottomRightBiggestWidth
              ? bottomRightWidth
              : bottomRightBiggestWidth;
        }
        allPositions[position].sort((a, b) => {
          const orderA = a.order;
          const orderB = b.order;
          if (orderA < orderB) {
            return -1;
          }
          if (orderA > orderB) {
            return 1;
          }

          return 0;
        });
        // .reverse();
      } else if (child.type === Main) {
        mainComponent = React.cloneElement(child);
      }
    }
  });

  const bottomGap = 26;
  const bottomCollapsBrake =
    bottomLeftBiggestWidth + bottomGap + bottomRightBiggestWidth;
  console.log('www brake', bottomCollapsBrake);

  const handleResize = () => {
    setWindowWidth(window.innerWidth);
  };
  useEffect(() => {
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // useEffect(() => {
  //   console.log('yyy');
  //   if (containerRef) {
  //     const containerWidth = containerRef.current?.clientWidth;
  //     const gap = 15;
  //     // containerRef.current.childNodes.forEach((currentItem) => {
  //     //   if (currentItem.className.startsWith('_bottom')) {
  //     //     const percent = (currentItem.clientWidth / containerWidth) * 100;
  //     //     console.log('xxx width', currentItem.clientWidth);

  //     //     currentItem.style.maxWidth = `calc(${percent}%)`;

  //     //   }
  //     // });
  //     containerRef.current.childNodes.forEach((currentItem) => {
  //       if (currentItem.className.startsWith('_topcenter')) {
  //         // const percent = (currentItem.clientWidth / containerWidth) * 100;
  //         // console.log('xxx width', currentItem.clientWidth);

  //         // currentItem.style.maxWidth = `calc(${percent}%)`;
  //         console.log('yyy', currentItem.clientWidth);
  //       }
  //     });
  //   }
  // }, [containerRef, windowWidth]);

  useEffect(() => {
    if (containerRef) {
      const containerWidth = containerRef.current?.clientWidth;
      console.log('www containerWidth', containerWidth);
    }
    if (windowWidth < 655 && screenSizeWatcher !== 'mobile') {
      setScreenSizeWatcher('mobile');
      console.log('xxx calback mobile');
      onResponsiveCollapse('mobile');
    } else if (windowWidth > 654 && screenSizeWatcher !== 'screen') {
      setScreenSizeWatcher('screen');
      console.log('xxx calback screen');
      onResponsiveCollapse('screen');
    }

    const containerWidth = containerRef.current?.clientWidth;
    const gap = 15;

    let bottomRightShift = 0;
    containerRef.current.childNodes.forEach((currentItem) => {
      if (currentItem.className.startsWith('_bottomright')) {
        console.log('yyy width', currentItem.clientHeight);
        console.log('yyy width', currentItem.clientWidth);

        if (bottomRightShift > 0) {
          currentItem.style.bottom = bottomRightShift + 'px';
        }

        bottomRightShift += currentItem.clientHeight + 10;
      }
    });
  }, [containerRef, windowWidth, screenSizeWatcher]);

  return (
    <div
      className={`${styles['container']} ${
        debugMode ? styles['debug-mode'] : ''
      }`}
    >
      <div className={styles['controls-container']} ref={containerRef}>
        {mainComponent ? mainComponent : null}
        {Object.keys(allPositions).map((position) => {
          if (position.startsWith('bottom')) {
            return (
              <>
                {allPositions[position].map((component, idx) => {
                  console.log('yyy', component);
                  return (
                    <div
                      className={`${styles[position]} ${
                        debugMode ? styles['debug-mode'] : ''
                      } ${
                        component.fullCollapseWidth
                          ? styles['full-collapse-width']
                          : ''
                      }`}
                    >
                      <Control {...component} key={idx} />
                    </div>
                  );
                })}
              </>
            );
          } else {
            return (
              <div
                className={`${styles[position]} ${
                  debugMode ? styles['debug-mode'] : ''
                }`}
              >
                {allPositions[position].map((component, idx) => {
                  return <Control {...component} key={idx} />;
                })}
              </div>
            );
          }
        })}
      </div>
    </div>
  );
};

export default ControlLayout;
