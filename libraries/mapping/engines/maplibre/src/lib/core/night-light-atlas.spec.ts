import { describe, expect, it } from "vitest";

import {
  NIGHT_LIGHT_ATLAS_MAX_RESOLUTION,
  bakeNightLightAtlas,
  type NightLightAtlasInput,
} from "./night-light-atlas";

const input = (overrides: Partial<NightLightAtlasInput> = {}) => ({
  resolution: 4,
  bounds: [0, 0, 4, 4] as const,
  heightRange: [0, 100] as const,
  lights: [],
  ...overrides,
});

const whiteLight = {
  position: [0.5, 20, 0.5] as const,
  groundHeight: 20,
  radius: 1,
  color: [1, 1, 1] as const,
  strength: 0.4,
};

describe("night light atlas", () => {
  it("clips a light at an atlas edge without spilling into other rows", () => {
    const pixels = bakeNightLightAtlas(input({ lights: [whiteLight] }));
    expect([...pixels.slice(0, 4)]).toEqual([102, 102, 102, 51]);
    expect([...pixels.slice(4)]).toEqual(new Array(60).fill(0));
  });

  it("adds RGB contributions and clamps the result", () => {
    const light = { ...whiteLight, strength: 0.6 };
    const pixels = bakeNightLightAtlas(input({ lights: [light, light] }));
    expect([...pixels.slice(0, 3)]).toEqual([255, 255, 255]);
  });

  it("stores irradiance-weighted normalized ground height in alpha", () => {
    const high = {
      ...whiteLight,
      position: [0.5, 80, 0.5] as const,
      groundHeight: 80,
      strength: 0.2,
    };
    const pixels = bakeNightLightAtlas(input({ lights: [whiteLight, high] }));
    expect(pixels[3]).toBe(102);
  });

  it("includes lamp-to-ground distance in radial falloff", () => {
    const pixels = bakeNightLightAtlas(
      input({
        lights: [
          {
            ...whiteLight,
            position: [0.5, 1, 0.5],
            groundHeight: 0,
            radius: 2,
            strength: 1,
          },
        ],
      })
    );
    expect(pixels[0]).toBe(128);
  });

  it("rejects non-finite values and invalid ranges", () => {
    expect(() => bakeNightLightAtlas(input({ heightRange: [1, 1] }))).toThrow(
      /heightRange/
    );
    expect(() =>
      bakeNightLightAtlas(
        input({ lights: [{ ...whiteLight, strength: Number.NaN }] })
      )
    ).toThrow(/strength/);
  });

  it("caps resolution", () => {
    const pixels = bakeNightLightAtlas(
      input({ resolution: NIGHT_LIGHT_ATLAS_MAX_RESOLUTION + 1 })
    );
    expect(pixels.length).toBe(NIGHT_LIGHT_ATLAS_MAX_RESOLUTION ** 2 * 4);
  });
});
