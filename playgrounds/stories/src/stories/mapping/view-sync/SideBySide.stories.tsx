import { Suspense, lazy } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { ViewSyncStoryProps } from "./ViewSyncStory";

const LazyViewSyncStory = lazy(async () => {
  const module = await import("./ViewSyncStory");
  return { default: module.ViewSyncStory };
});

const meta: Meta<ViewSyncStoryProps> = {
  title: "Mapping/ViewSync",
  parameters: {
    layout: "fullscreen",
  },
  args: {
    longitudeDeg: 7.17618,
    latitudeDeg: 51.25609,
    altitudeM: 222.4,
    bearingDeg: 214,
    pitchDeg: 42,
    rangeM: 620,
    fovVerticalDeg: 60,
    nearPlaneM: 1,
    farPlaneM: 500000,
  },
  argTypes: {
    longitudeDeg: {
      name: "longitude",
      control: { type: "number" },
    },
    latitudeDeg: {
      name: "latitude",
      control: { type: "number" },
    },
    altitudeM: {
      name: "altitude m",
      control: { type: "number" },
    },
    bearingDeg: {
      name: "bearing deg",
      control: { type: "number" },
    },
    pitchDeg: {
      name: "pitch deg",
      control: { type: "number" },
    },
    rangeM: {
      name: "range m",
      control: { type: "number" },
    },
    fovVerticalDeg: {
      name: "fov v deg",
      control: { type: "number" },
    },
    nearPlaneM: {
      name: "near m",
      control: { type: "number" },
    },
    farPlaneM: {
      name: "far m",
      control: { type: "number" },
    },
  },
};

export default meta;

export const SideBySide: StoryObj<ViewSyncStoryProps> = {
  name: "Multi View",
  render: (args) => (
    <Suspense
      fallback={<div style={{ padding: 24 }}>Loading ViewSync story...</div>}
    >
      <LazyViewSyncStory {...args} />
    </Suspense>
  ),
};
