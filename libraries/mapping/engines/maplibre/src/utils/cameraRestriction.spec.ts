import { describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";

import { applyCameraRestriction } from "./cameraRestriction";

const handler = () => ({ enable: vi.fn(), disable: vi.fn() });

const mapWithBearing = (bearing: number) => {
  const map = {
    dragRotate: handler(),
    touchPitch: handler(),
    touchZoomRotate: {
      enableRotation: vi.fn(),
      disableRotation: vi.fn(),
    },
    keyboard: { enableRotation: vi.fn(), disableRotation: vi.fn() },
    setMaxPitch: vi.fn(),
    getBearing: () => bearing,
    setBearing: vi.fn(),
  };
  return { map, asMap: map as unknown as MaplibreMap };
};

describe("applyCameraRestriction", () => {
  it("turns a rotated map north-up", () => {
    const { map, asMap } = mapWithBearing(30);
    applyCameraRestriction(asMap, true, true, 60);
    expect(map.setBearing).toHaveBeenCalledWith(0);
  });

  it("leaves a north-up map alone", () => {
    const { map, asMap } = mapWithBearing(0);
    applyCameraRestriction(asMap, true, true, 60);
    expect(map.setBearing).not.toHaveBeenCalled();
  });
});
