/// <reference types="@webgpu/types" />
import type { Meta, StoryObj } from "@storybook/react";
import { presets } from "./atmospheric-refraction-settings";
import { RefractionExperiment } from "./AtmosphericRefractionExperiment";

const meta = {
  title: "Terrain and Atmosphere/Terrain Horizon",
  id: "terrain-and-atmosphere-refraction-webgpu",
  component: RefractionExperiment,
  parameters: { layout: "fullscreen" },
  args: {
    preset: "mixed",
    ...presets.mixed,
    charts: true,
    sunHour: 12,
    verticalFov: 4,
    steps: 512,
  },
  argTypes: {
    preset: {
      control: "select",
      options: ["ideal", "mixed", "inversion", "haze", "custom"],
    },
    temperature: {
      control: { type: "range", min: -10, max: 35, step: 1 },
      if: { arg: "preset", eq: "custom" },
    },
    pressure: {
      control: { type: "range", min: 930, max: 1030, step: 1 },
      if: { arg: "preset", eq: "custom" },
    },
    lapse: {
      control: { type: "range", min: -15, max: 5, step: 0.5 },
      if: { arg: "preset", eq: "custom" },
    },
    inversion: {
      control: { type: "range", min: -5, max: 10, step: 0.5 },
      if: { arg: "preset", eq: "custom" },
    },
    layer: {
      control: { type: "range", min: 200, max: 1500, step: 10 },
      if: { arg: "preset", eq: "custom" },
    },
    depth: {
      control: { type: "range", min: 20, max: 400, step: 10 },
      if: { arg: "preset", eq: "custom" },
    },
    visibility: {
      control: { type: "range", min: 1000, max: 150000, step: 1000 },
      if: { arg: "preset", eq: "custom" },
    },
    charts: { control: "boolean" },
    sunHour: { control: { type: "range", min: 4, max: 20, step: 0.25 } },
    verticalFov: { control: { type: "range", min: 1, max: 4, step: 0.1 } },
    steps: { control: "inline-radio", options: [128, 256, 512, 1024] },
  },
} satisfies Meta<typeof RefractionExperiment>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Refraction: Story = { name: "Refraction · WebGPU experiment" };
