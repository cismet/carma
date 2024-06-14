import type { Meta, StoryObj } from '@storybook/react';
import { MapControl } from './map-control';
import Control from './components/Control';
import ControlLayout from './components/ControlLayout';
import Main from './components/Main';
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
import { within } from '@storybook/testing-library';
import { expect } from '@storybook/jest';
import { Excalidraw } from '@excalidraw/excalidraw';
import DemoPlugin from './components/DemoPlugin';
import MapExample from './components/MapExample.jsx';

const meta: Meta<typeof MapControl> = {
  component: MapControl,
  title: 'MapControl',
};
export default meta;
type Story = StoryObj<typeof MapControl>;

export const Primary = {
  args: {},
};

export const Heading: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/Welcome to MapControl!/gi)).toBeTruthy();
  },
};

export const SimleExample = () => {
  return (
    <ControlLayout>
      <Control position="topright" order={30}>
        <FilterOutlined />
      </Control>
      <Control position="topright" order={20}>
        <SettingFilled />
      </Control>
      <Control position="topright" order={40}>
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
        <div style={{ height: '100%', width: '100%' }}>
          <Excalidraw />
        </div>
      </Main>
    </ControlLayout>
  );
};

export const LeafletExample = () => {
  return (
    <ControlLayout>
      <Control position="topright" order={30}>
        <FilterOutlined />
      </Control>
      <Control position="topright" order={20}>
        <SettingFilled />
      </Control>
      <Control position="topright" order={40}>
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
        <div style={{ height: '100%', width: '100%' }}>
          {/* <Excalidraw /> */}
        </div>
        <MapExample />
      </Main>
    </ControlLayout>
  );
};
