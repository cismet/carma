import type { Meta, StoryObj } from "@storybook/react";
// import { MapControl } from './map-control';
import Control from "./components/Control";
import ControlLayoutCanvas from "./components/ControlLayoutCanvas.js";
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
} from "@ant-design/icons";
import { Excalidraw } from "@excalidraw/excalidraw";
import MapExample from "./components/MapExample.jsx";
import { useState } from "react";
import ControlLayout from "./map-control";

const meta: Meta<typeof ControlLayout> = {
  component: ControlLayout,
  title: "MapControl",
};
export default meta;
type Story = StoryObj<typeof ControlLayout>;

export const Primary = {
  args: {},
};

// export const Heading: Story = {
//   args: {},
//   play: async ({ canvasElement }) => {
//     const canvas = within(canvasElement);
//     expect(canvas.getByText(/Welcome to MapControl!/gi)).toBeTruthy();
//   },
// };

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
      <ControlLayoutCanvas>
        <div style={{ height: "100%", width: "100%" }}>
          <Excalidraw />
        </div>
      </ControlLayoutCanvas>
    </ControlLayout>
  );
};

export const LeafletExample = () => {
  const [fireLocation, setFireLocation] = useState(false);
  return (
    <ControlLayout>
      <Control position="topleft" order={30}>
        <FilterOutlined onClick={() => setFireLocation(!fireLocation)} />
      </Control>
      <ControlLayoutCanvas>
        <div style={{ height: "100%", width: "100%" }}>
          <MapExample startLocate={fireLocation} />
        </div>
      </ControlLayoutCanvas>
    </ControlLayout>
  );
};
