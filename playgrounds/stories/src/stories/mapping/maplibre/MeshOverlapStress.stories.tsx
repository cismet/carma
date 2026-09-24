import type { Meta, StoryObj } from "@storybook/react";
import { MeshMountSharedViews } from "./MeshMountSharedViews";
import { MESH_MOUNT_ANCHOR, MESH_MOUNT_VIEW } from "./mesh-mount-presets";

const meta = {
  title: "Terrain and Atmosphere/Projections/Shared Views",
  id: "tile-loading-manager-multi-camera-overlap",
  component: MeshMountSharedViews,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Two interactive cameras sharing one mesh pool. The right view is an asynchronous preview, not another MapLibre instance. Transform methods live in Transform Strategies; additional flight windows remain in Mesh Coverage.",
      },
    },
  },
  args: {
    view: MESH_MOUNT_VIEW.ROOT,
    anchor: MESH_MOUNT_ANCHOR.ROOT,
    zoom: 18,
    pitch: 0,
    verticalFovDegrees: 35,
    basemapOpacity: 1,
    meshOnlyFlight: false,
    pixelError: 2,
    viewportWidth: 100,
    viewportHeight: 100,
    viewportPosition: "center",
    animateViewport: false,
    animateOverlap: false,
  },
  argTypes: {
    anchor: { table: { disable: true } },
    view: { control: "select", options: Object.values(MESH_MOUNT_VIEW) },
    viewportWidth: { table: { disable: true } },
    viewportHeight: { table: { disable: true } },
    viewportPosition: { table: { disable: true } },
    animateViewport: { table: { disable: true } },
    animateOverlap: {
      control: false,
      table: { disable: true },
      description:
        "Run / pause without resetting the resident pool or elapsed flight time.",
    },
    pixelError: {
      control: { type: "range", min: 1, max: 16, step: 1 },
      table: { category: "Loading" },
    },
    zoom: { table: { category: "Paused camera" } },
    pitch: { table: { category: "Paused camera" } },
  },
} satisfies Meta<typeof MeshMountSharedViews>;
export default meta;
type Story = StoryObj<typeof meta>;
export const OrbitAndOverlap: Story = {
  name: "Two interactive views · one pool",
};
