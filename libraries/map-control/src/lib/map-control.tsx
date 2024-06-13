import styles from './map-control.module.css';

/* eslint-disable-next-line */
export interface MapControlProps {}

export function MapControl(props: MapControlProps) {
  return (
    <div className={styles['container']}>
      <h1>Welcome to MapControl!</h1>
    </div>
  );
}

export default MapControl;
