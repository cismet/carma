import styles from './map-control.module.css';
import ControlLayout from './components/ControlLayout';
import Control from './components/Control';
import Main from './components/Main';
export interface MapControlProps {}
import {
  HomeOutlined,
  LoadingOutlined,
  SettingFilled,
  SmileOutlined,
  SyncOutlined,
} from '@ant-design/icons';
export function MapControl(props: MapControlProps) {
  return (
    <div>
      <ControlLayout>
        <Control position="topright" order={10}>
          <SmileOutlined rotate={180} />
        </Control>
        <Control position="topright" order={20}>
          <SettingFilled />
        </Control>
        <Control position="topright" order={30}>
          <SyncOutlined spin />
        </Control>
        <Control position="topleft" order={20}>
          <HomeOutlined />
        </Control>
        <Control position="topleft" order={20}>
          <SmileOutlined />
        </Control>
        <Control position="bottomleft" order={20}>
          <LoadingOutlined />
        </Control>
        <Main>
          <div>Main</div>
        </Main>
      </ControlLayout>
    </div>
  );
}

export default MapControl;
