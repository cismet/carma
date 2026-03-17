import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readSceneStateFromMapLibrePlusElevationHashValues } from "../scene-state-hash/sceneStateHashMapLibreAdapter";

const mockGetHash = vi.fn<[], Record<string, string>>();
const mockGetHashValues = vi.fn<[], Record<string, unknown>>();

vi.mock("../HashStateProvider", () => ({
  useHashState: () => ({
    getHash: mockGetHash,
    getHashValues: mockGetHashValues,
  }),
}));

import { useInitialSceneStateHashSnapshot } from "./useInitialSceneStateHashSnapshot";

const DEFAULT_ZOOM = 17;
const DEFAULT_FOV_DEG = 45;
const VIEWPORT_WIDTH_PX = 1400;
const VIEWPORT_HEIGHT_PX = 900;
const BASE_HASH_VALUES = {
  lng: 7.1187819,
  lat: 51.2484327,
  altitude: 338.07,
};

const setViewport = () => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: VIEWPORT_WIDTH_PX,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: VIEWPORT_HEIGHT_PX,
  });
};

const renderInitialSnapshot = (
  hashValues: Record<string, unknown>,
  options: {
    defaultFovDeg?: number;
    defaultZoom?: number;
  } = {
    defaultFovDeg: DEFAULT_FOV_DEG,
    defaultZoom: DEFAULT_ZOOM,
  }
) => {
  mockGetHash.mockReturnValue({});
  mockGetHashValues.mockReturnValue(hashValues);

  return renderHook(() => useInitialSceneStateHashSnapshot(options));
};

describe("useInitialSceneStateHashSnapshot", () => {
  beforeEach(() => {
    mockGetHash.mockReset();
    mockGetHashValues.mockReset();
    setViewport();
  });

  it.each([
    ["anchor-only hashes", BASE_HASH_VALUES],
    ["bearing-only hashes", { ...BASE_HASH_VALUES, bearing: 316.61 }],
    ["pitch-only hashes", { ...BASE_HASH_VALUES, pitch: 57.51 }],
    ["fov-only hashes", { ...BASE_HASH_VALUES, fov: 35 }],
    [
      "fully specified shared camera hashes",
      {
        ...BASE_HASH_VALUES,
        bearing: 316.61,
        pitch: 57.51,
        fov: 45,
      },
    ],
  ])(
    "uses the configured default zoom for missing-zoom %s",
    (_label, hashValues) => {
      const expected = readSceneStateFromMapLibrePlusElevationHashValues({
        values: {
          ...hashValues,
          zoom: DEFAULT_ZOOM,
        },
        viewportWidthPx: VIEWPORT_WIDTH_PX,
        viewportHeightPx: VIEWPORT_HEIGHT_PX,
        options: { defaultFovDeg: DEFAULT_FOV_DEG },
      });

      const { result } = renderInitialSnapshot(hashValues);

      expect(result.current.isResolved).toBe(true);
      expect(result.current.initialCameraState).toEqual(expected);
    }
  );

  it("returns null for shared camera hashes without zoom when no default zoom is configured", () => {
    const { result } = renderInitialSnapshot(
      {
        ...BASE_HASH_VALUES,
        bearing: 316.61,
        pitch: 57.51,
        fov: 45,
      },
      { defaultFovDeg: DEFAULT_FOV_DEG }
    );

    expect(result.current.isResolved).toBe(true);
    expect(result.current.initialCameraState).toBeNull();
  });
});
