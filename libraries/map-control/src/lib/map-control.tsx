import styles from './map-control.module.css';
import ControlLayout from './components/ControlLayout';
import Control from './components/Control';

export interface MapControlProps {}

export function MapControl(props: MapControlProps) {
  return (
    <div className={styles['container']}>
      <ControlLayout>
        <Control position="topright" order={20}>
          <div>Foto</div>
        </Control>
        <Control position="topright" order={20}>
          <div>Foto</div>
        </Control>
        <Control position="topleft" order={20}>
          <div>Foto</div>
        </Control>
        <Control position="topright" order={20}>
          <div>Foto</div>
        </Control>
        <Control position="topleft" order={20}>
          <div>Foto</div>
        </Control>
      </ControlLayout>
    </div>
  );
}

export default MapControl;
