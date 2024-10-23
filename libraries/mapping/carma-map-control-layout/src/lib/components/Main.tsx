import { forwardRef, ReactNode } from 'react';
import styles from '../map-control.module.css';

export interface MainProps {
  children: ReactNode;
}

export type Ref = HTMLDivElement;

const Main = forwardRef<Ref, MainProps>((props, ref) => {
  const { children } = props;

  return (
    <div ref={ref} className={styles['main']}>
      {children}
    </div>
  );
});

export default Main;
