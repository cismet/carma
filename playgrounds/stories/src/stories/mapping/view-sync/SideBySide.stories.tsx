import { Suspense, lazy } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { ViewSyncStoryProps } from "./ViewSyncStory";
import {
  DEFAULT_STORY_RANGE_M,
  RATHAUS_BARMEN_HOME_POSE,
} from "./viewSyncStoryShared";

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
    longitudeDeg: RATHAUS_BARMEN_HOME_POSE.lngDeg,
    latitudeDeg: RATHAUS_BARMEN_HOME_POSE.latDeg,
    altitudeM: RATHAUS_BARMEN_HOME_POSE.altitudeM,
    bearingDeg: RATHAUS_BARMEN_HOME_POSE.bearingDeg,
    pitchDeg: RATHAUS_BARMEN_HOME_POSE.pitchDeg,
    rangeM: DEFAULT_STORY_RANGE_M,
    fovVerticalDeg: 60,
    nearPlaneM: 1,
    farPlaneM: 500000,
    allowLeafletFractionalZoom: false,
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
    allowLeafletFractionalZoom: {
      name: "leaflet fractional zoom",
      control: { type: "boolean" },
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
