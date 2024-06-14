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
  ShrinkOutlined,
  MinusOutlined,
  PlusOutlined,
  ExclamationCircleOutlined,
  MenuOutlined,
  FilterOutlined,
} from '@ant-design/icons';
export function MapControl(props: MapControlProps) {
  return (
    <div>
      <ControlLayout>
        <Control position="topright" order={10}>
          <FilterOutlined />
        </Control>
        <Control position="topright" order={20}>
          <SettingFilled />
        </Control>
        <Control position="topright" order={30}>
          <MenuOutlined />
        </Control>
        <Control position="topleft" order={30}>
          <MinusOutlined />
        </Control>
        <Control position="topleft" order={20}>
          <ShrinkOutlined />
        </Control>
        <Control position="topleft" order={40}>
          <PlusOutlined />
        </Control>
        <Control position="bottomright" order={20}>
          <ExclamationCircleOutlined />
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
