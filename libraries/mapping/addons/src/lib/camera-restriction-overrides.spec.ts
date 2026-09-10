import type { Map as MaplibreMap } from "maplibre-gl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setCameraRestrictionOverride } from "@carma-mapping/engines/maplibre";

import {
  ADDON_CAMERA_RESTRICTION_PRIORITY,
  setAddonCameraRestriction,
} from "./camera-restriction-overrides";

vi.mock("@carma-mapping/engines/maplibre", () => ({
  setCameraRestrictionOverride: vi.fn(),
}));

const createMap = ({
  minPitch = 8,
  maxPitch = 60,
  centerClampedToGround = true,
} = {}) => {
  let currentMinPitch = minPitch;
  let currentCenterClamp = centerClampedToGround;
  const setMinPitch = vi.fn((next: number) => {
    currentMinPitch = next;
  });
  const setCenterClampedToGround = vi.fn((next: boolean) => {
    currentCenterClamp = next;
  });
  const map = {
    getMinPitch: vi.fn(() => currentMinPitch),
    getMaxPitch: vi.fn(() => maxPitch),
    setMinPitch,
    getCenterClampedToGround: vi.fn(() => currentCenterClamp),
    setCenterClampedToGround,
  } as unknown as MaplibreMap;

  return { map, setMinPitch, setCenterClampedToGround };
};

describe("addon camera restriction overrides", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps free camera authoritative and restores lower-priority policies", () => {
    const { map, setMinPitch, setCenterClampedToGround } = createMap();
    const route = Symbol("route");
    const interaction = Symbol("interaction");
    const freeCamera = Symbol("freeCamera");

    setAddonCameraRestriction(map, route, {
      restricted: true,
      maxPitch: 60,
    });
    setAddonCameraRestriction(
      map,
      interaction,
      { restricted: false, maxPitch: 60 },
      ADDON_CAMERA_RESTRICTION_PRIORITY.INTERACTION
    );
    setAddonCameraRestriction(
      map,
      freeCamera,
      {
        restricted: false,
        maxPitch: 180,
        minPitch: 0,
        centerClampedToGround: false,
      },
      ADDON_CAMERA_RESTRICTION_PRIORITY.FREE_CAMERA
    );

    vi.mocked(setCameraRestrictionOverride).mockClear();
    setMinPitch.mockClear();
    setCenterClampedToGround.mockClear();

    setAddonCameraRestriction(map, route, {
      restricted: true,
      maxPitch: 0,
    });
    expect(setCameraRestrictionOverride).not.toHaveBeenCalled();

    setAddonCameraRestriction(map, freeCamera, null);
    expect(setCameraRestrictionOverride).toHaveBeenLastCalledWith(map, {
      restricted: false,
      maxPitch: 60,
    });
    expect(setMinPitch).toHaveBeenLastCalledWith(8);
    expect(setCenterClampedToGround).toHaveBeenLastCalledWith(true);
    expect(
      vi.mocked(setCameraRestrictionOverride).mock.invocationCallOrder.at(-1)
    ).toBeLessThan(setMinPitch.mock.invocationCallOrder.at(-1) ?? 0);
    expect(setMinPitch.mock.invocationCallOrder.at(-1)).toBeLessThan(
      setCenterClampedToGround.mock.invocationCallOrder.at(-1) ?? 0
    );

    setAddonCameraRestriction(map, interaction, null);
    expect(setCameraRestrictionOverride).toHaveBeenLastCalledWith(map, {
      restricted: true,
      maxPitch: 0,
    });

    setAddonCameraRestriction(map, route, null);
    expect(setCameraRestrictionOverride).toHaveBeenLastCalledWith(map, null);
  });

  it("replaces repeated writes from one owner instead of stacking duplicates", () => {
    const { map, setMinPitch, setCenterClampedToGround } = createMap();
    const owner = Symbol("strict-mode-owner");
    const policy = {
      restricted: false,
      maxPitch: 180,
      minPitch: 0,
      centerClampedToGround: false,
    };

    setAddonCameraRestriction(map, owner, policy);
    vi.mocked(setCameraRestrictionOverride).mockClear();
    setMinPitch.mockClear();
    setCenterClampedToGround.mockClear();

    setAddonCameraRestriction(map, owner, { ...policy });
    expect(setCameraRestrictionOverride).not.toHaveBeenCalled();
    expect(setMinPitch).not.toHaveBeenCalled();
    expect(setCenterClampedToGround).not.toHaveBeenCalled();

    setAddonCameraRestriction(map, owner, null);
    expect(setCameraRestrictionOverride).toHaveBeenCalledTimes(1);
    expect(setCameraRestrictionOverride).toHaveBeenLastCalledWith(map, null);
    expect(setMinPitch).toHaveBeenLastCalledWith(8);
    expect(setCenterClampedToGround).toHaveBeenLastCalledWith(true);

    vi.mocked(setCameraRestrictionOverride).mockClear();
    setAddonCameraRestriction(map, owner, null);
    expect(setCameraRestrictionOverride).not.toHaveBeenCalled();
  });

  it("does not republish when an inactive lower-priority owner cleans up", () => {
    const { map, setMinPitch, setCenterClampedToGround } = createMap();
    const route = Symbol("route");
    const freeCamera = Symbol("freeCamera");

    setAddonCameraRestriction(map, route, {
      restricted: true,
      maxPitch: 0,
    });
    setAddonCameraRestriction(
      map,
      freeCamera,
      {
        restricted: false,
        maxPitch: 180,
        minPitch: 0,
        centerClampedToGround: false,
      },
      ADDON_CAMERA_RESTRICTION_PRIORITY.FREE_CAMERA
    );
    vi.mocked(setCameraRestrictionOverride).mockClear();
    setMinPitch.mockClear();
    setCenterClampedToGround.mockClear();

    setAddonCameraRestriction(map, route, null);
    expect(setCameraRestrictionOverride).not.toHaveBeenCalled();
    expect(setMinPitch).not.toHaveBeenCalled();
    expect(setCenterClampedToGround).not.toHaveBeenCalled();

    setAddonCameraRestriction(map, freeCamera, null);
    expect(setCameraRestrictionOverride).toHaveBeenLastCalledWith(map, null);
    expect(setMinPitch).toHaveBeenLastCalledWith(8);
    expect(setCenterClampedToGround).toHaveBeenLastCalledWith(true);
  });

  it("restores the previous owner when equal-priority policies overlap", () => {
    const { map } = createMap();
    const first = Symbol("first");
    const second = Symbol("second");

    setAddonCameraRestriction(map, first, {
      restricted: true,
      maxPitch: 0,
    });
    setAddonCameraRestriction(map, second, {
      restricted: false,
      maxPitch: 70,
    });
    expect(setCameraRestrictionOverride).toHaveBeenLastCalledWith(map, {
      restricted: false,
      maxPitch: 70,
    });

    setAddonCameraRestriction(map, second, null);
    expect(setCameraRestrictionOverride).toHaveBeenLastCalledWith(map, {
      restricted: true,
      maxPitch: 0,
    });

    setAddonCameraRestriction(map, first, null);
  });

  it("keeps requests isolated by MapLibre map identity", () => {
    const firstMap = createMap().map;
    const secondMap = createMap().map;
    const owner = Symbol("shared-owner-token");

    setAddonCameraRestriction(firstMap, owner, {
      restricted: true,
      maxPitch: 0,
    });
    setAddonCameraRestriction(secondMap, owner, {
      restricted: false,
      maxPitch: 180,
    });
    vi.mocked(setCameraRestrictionOverride).mockClear();

    setAddonCameraRestriction(firstMap, owner, null);
    expect(setCameraRestrictionOverride).toHaveBeenCalledTimes(1);
    expect(setCameraRestrictionOverride).toHaveBeenLastCalledWith(
      firstMap,
      null
    );

    setAddonCameraRestriction(secondMap, owner, {
      restricted: false,
      maxPitch: 180,
    });
    expect(setCameraRestrictionOverride).toHaveBeenCalledTimes(1);

    setAddonCameraRestriction(secondMap, owner, null);
    expect(setCameraRestrictionOverride).toHaveBeenCalledTimes(2);
    expect(setCameraRestrictionOverride).toHaveBeenLastCalledWith(
      secondMap,
      null
    );
  });
});
