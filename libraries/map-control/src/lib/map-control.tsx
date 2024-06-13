import styles from './map-control.module.css';
import ControlLayout from './components/ControlLayout';
import Control from './components/Control';
import Main from './components/Main';
export interface MapControlProps {}

export function MapControl(props: MapControlProps) {
  return (
    <div>
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
        <Main>
          <div>Main</div>
        </Main>
      </ControlLayout>
    </div>
  );
}

export default MapControl;
