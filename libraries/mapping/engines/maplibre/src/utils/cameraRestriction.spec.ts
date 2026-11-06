import type { Map as MaplibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import { applyCameraRestriction } from "./cameraRestriction";

const createMap = (requestedCameraMaxPitch?: number) => {
  const handler = () => ({
    enable: vi.fn(),
    disable: vi.fn(),
    enableRotation: vi.fn(),
    disableRotation: vi.fn(),
  });
  const requestedCamera =
    requestedCameraMaxPitch === undefined
      ? undefined
      : {
          maxPitch: requestedCameraMaxPitch,
          setMaxPitch(next: number) {
            this.maxPitch = next;
          },
        };
  const map = {
    dragRotate: handler(),
    touchPitch: handler(),
    touchZoomRotate: handler(),
    keyboard: handler(),
    setMaxPitch: vi.fn(),
    setBearing: vi.fn(),
    _requestedCameraState: requestedCamera,
  };
  return { map: map as unknown as MaplibreMap, mocks: map, requestedCamera };
};

describe("applyCameraRestriction", () => {
  it("lifts the limit on a camera copy left over from a terrain phase", () => {
    const { map, mocks, requestedCamera } = createMap(0);

    applyCameraRestriction(map, false, true, 60);

    expect(mocks.setMaxPitch).toHaveBeenCalledWith(60);
    expect(requestedCamera?.maxPitch).toBe(60);
  });

  it("locks a camera copy left over from a terrain phase", () => {
    const { map, mocks, requestedCamera } = createMap(60);

    applyCameraRestriction(map, true, true, 60);

    expect(mocks.setMaxPitch).toHaveBeenCalledWith(0);
    expect(requestedCamera?.maxPitch).toBe(0);
  });

  it("works without a camera copy", () => {
    const { map, mocks } = createMap();

    applyCameraRestriction(map, false, true, 60);

    expect(mocks.setMaxPitch).toHaveBeenCalledWith(60);
  });
});
