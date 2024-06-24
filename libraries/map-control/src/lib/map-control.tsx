import React, { ReactNode, useRef, useState, useEffect } from 'react';
import Control, { ControlProps } from './components/Control';
import styles from './map-control.module.css';
import Main from './components/Main';

export interface ControlLayoutProps {
  children: ReactNode;
  onResponsiveCollapse?: Function;
  debugMode?: boolean;
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
  let bottomLeftBiggestWidth = 300;
  let bottomRightBiggestWidth = 300;
  const bottomGap = 26;
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

  const bottomCollapsBrake =
    bottomLeftBiggestWidth + bottomGap + bottomRightBiggestWidth;

  const layoutWidth = containerRef.current?.clientWidth;

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

  useEffect(() => {
    if (containerRef) {
      if (!mainComponent) {
        throw new Error('ControlLayout requires a Main component as a child.');
      }

      const containerWidth = containerRef.current?.clientWidth;
      if (
        containerWidth &&
        containerWidth < bottomCollapsBrake &&
        screenSizeWatcher !== 'mobile'
      ) {
        setScreenSizeWatcher('mobile');
        console.log('xxx calback mobile');
        onResponsiveCollapse('mobile');
      } else if (
        containerWidth &&
        containerWidth > bottomCollapsBrake &&
        screenSizeWatcher !== 'screen'
      ) {
        setScreenSizeWatcher('screen');
        console.log('xxx calback screen');
        onResponsiveCollapse('screen');
      }

      let bottomRightShift = 0;
      containerRef.current.childNodes.forEach((currentItem) => {
        if (currentItem.className.startsWith('_bottomright')) {
          if (bottomRightShift > 0) {
            currentItem.style.bottom = bottomRightShift + 'px';
          }

          bottomRightShift += currentItem.clientHeight + 10;
        }
      });

      let bottomLeftShift = 0;
      containerRef.current.childNodes.forEach((currentItem) => {
        if (currentItem.className.startsWith('_bottomleft')) {
          if (bottomLeftShift > 0) {
            currentItem.style.bottom = bottomLeftShift + 'px';
          }

          bottomLeftShift += currentItem.clientHeight + 10;
        }
      });
    }
  }, [containerRef, windowWidth, screenSizeWatcher]);

  return (
    <div
      className={`${styles['container']} ${
        debugMode ? styles['debug-mode'] : ''
      }`}
    >
      <div
        className={`${styles['controls-container']} ${
          layoutWidth <= bottomCollapsBrake
            ? styles['controls-container__mobile']
            : ''
        }`}
        ref={containerRef}
      >
        {mainComponent ? mainComponent : null}
        {Object.keys(allPositions).map((position) => {
          if (position.startsWith('bottom')) {
            return (
              <>
                {allPositions[position].map((component, idx) => {
                  return (
                    <div
                      className={`${styles[position]} ${
                        debugMode ? styles['debug-mode'] : ''
                      } ${
                        component.fullCollapseWidth &&
                        layoutWidth <= bottomCollapsBrake
                          ? styles['full-collapse-width']
                          : ''
                      } ${
                        layoutWidth <= bottomCollapsBrake
                          ? styles[position + '__mobile']
                          : ''
                      } ${
                        idx === 0 && layoutWidth <= bottomCollapsBrake
                          ? styles[position + '__first']
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
