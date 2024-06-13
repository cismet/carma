import styles from './map-control.module.css';
import ControlLayout from './components/ControlLayout';
/* eslint-disable-next-line */
export interface MapControlProps {}

export function MapControl(props: MapControlProps) {
  return (
    <div className={styles['container']}>
      <ControlLayout />
    </div>
  );
}

export default MapControl;
