import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { Degrees } from "@carma-units";
import type { ObliqueDataset } from "../../core/types";
import { enterObliqueView } from "./obliqueCamera";

const ease = vi.hoisted(() => vi.fn());
vi.mock("@carma-mapping/engines/maplibre", async () => ({
  ...(await vi.importActual(
    "../../../../../engines/maplibre/src/utils/zoomUtils"
  )),
  easeMapLibreCameraWithFov: ease,
  setCameraRestrictionOverride: vi.fn(),
}));

beforeEach(() => ease.mockReset());

describe("oblique entry bearing", () => {
  it.each([
    { heading: undefined, expected: 324.5 },
    { heading: 0, expected: 0 },
    { heading: 3.2, expected: 3.2 },
    { heading: Number.NaN, expected: 324.5 },
  ])(
    "uses $expected degrees for entry heading $heading without changing other camera targets",
    ({ heading, expected }) => {
      const map = {
        getCenter: () => ({ lng: 7.2, lat: 51.27 }),
        getBearing: () => 324.5,
        transform: { height: 800 },
      } as unknown as MaplibreMap;
      const dataset = {
        pitchDeg: 45,
        enterFovDeg: 30,
        cameraHeightAboveCenter: 300,
        animations: {},
      } as ObliqueDataset;
      const flight = { done: Promise.resolve(), cancel: vi.fn() };
      ease.mockReturnValue(flight);
      expect(
        enterObliqueView(map, dataset, heading as Degrees | undefined)
      ).toBe(flight);
      const target = ease.mock.calls[0][1];
      expect(target).toEqual(
        expect.objectContaining({
          bearing: expected,
          pitch: 45,
          zoom: expect.any(Number),
          essential: true,
        })
      );
      expect(Number.isFinite(target.zoom)).toBe(true);
      expect(ease.mock.calls[0][2]).toBe(30);
      enterObliqueView(map, dataset);
      expect(ease.mock.calls[1][1]).toEqual({ ...target, bearing: 324.5 });
    }
  );
});
