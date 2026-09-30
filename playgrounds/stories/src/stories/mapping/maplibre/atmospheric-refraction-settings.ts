/// <reference types="@webgpu/types" />

export const presets = {
  ideal: {
    temperature: 15,
    pressure: 970,
    lapse: -6.5,
    inversion: 0,
    layer: 450,
    depth: 100,
    visibility: 1e12,
  },
  mixed: {
    temperature: 15,
    pressure: 970,
    lapse: -6.5,
    inversion: 0,
    layer: 450,
    depth: 100,
    visibility: 80000,
  },
  inversion: {
    temperature: 5,
    pressure: 990,
    lapse: -6.5,
    inversion: 5,
    layer: 450,
    depth: 100,
    visibility: 25000,
  },
  haze: {
    temperature: 24,
    pressure: 975,
    lapse: -6.5,
    inversion: 2,
    layer: 600,
    depth: 150,
    visibility: 12000,
  },
  custom: {
    temperature: 15,
    pressure: 970,
    lapse: -6.5,
    inversion: 0,
    layer: 450,
    depth: 100,
    visibility: 80000,
  },
};

export type Args = {
  preset: keyof typeof presets;
  temperature: number;
  pressure: number;
  lapse: number;
  inversion: number;
  layer: number;
  depth: number;
  visibility: number;
  charts: boolean;
  sunHour: number;
  verticalFov: number;
  steps: number;
};
