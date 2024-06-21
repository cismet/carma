import React, { ReactNode, useRef, useState, useEffect } from 'react';
import Control from './components/Control';
import styles from './map-control.module.css';
import Main from './components/Main';

export interface ControlLayoutProps {
  children: ReactNode;
  onResponsiveCollapse?: Function;
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

const ControlLayout: React.FC<ControlLayoutProps> = ({
  children,
  onResponsiveCollapse = () => console.log(),
}) => {
  const [windowWidth, setWindowWidth] = useState(0);
  const [screenSizeWatcher, setScreenSizeWatcher] = useState('');
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
  //   if (containerRef) {
  //     const containerWidth = containerRef.current?.clientWidth;
  //     const gap = 15;
  //     containerRef.current.childNodes.forEach((currentItem) => {
  //       if (currentItem.className.startsWith('_bottom')) {
  //         const percent = (currentItem.clientWidth / containerWidth) * 100;
  //         console.log('xxx width', currentItem.clientWidth);

  //         currentItem.style.maxWidth = `calc(${percent}%)`;

  //       }
  //     });
  //   }
  // }, [containerRef]);

  useEffect(() => {
    if (containerRef) {
      const containerWidth = containerRef.current?.clientWidth;
      console.log('xxx', windowWidth);
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
  }, [containerRef, windowWidth, screenSizeWatcher]);

  return (
    <div className={styles['container']}>
      <div className={styles['controls-container']} ref={containerRef}>
        {mainComponent ? mainComponent : null}
        {Object.keys(allPositions).map((position) => {
          return (
            <div className={styles[position]}>
              {allPositions[position].map((component, idx) => {
                // return (
                //   <div className={styles['control-item']}>
                //     <Control {...component} key={idx} />
                //   </div>
                return <Control {...component} key={idx} />;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ControlLayout;
