import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setCameraRestrictionOverride } from "@carma-mapping/engines/maplibre";

import type { AddonComponentProps } from "../lib/registry";
import { FreeCamera, FREE_CAMERA_MAX_PITCH } from "./FreeCamera";

vi.mock("@carma-mapping/engines/maplibre", () => ({
  setCameraRestrictionOverride: vi.fn(),
}));

const createMap = (
  id: string,
  events: string[],
  { minPitch = 8, maxPitch = 60, centerClampedToGround = true } = {}
) => {
  let currentMinPitch = minPitch;
  let currentCenterClamp = centerClampedToGround;
  const map = {
    getMinPitch: vi.fn(() => currentMinPitch),
    getMaxPitch: vi.fn(() => maxPitch),
    setMinPitch: vi.fn((next: number) => {
      currentMinPitch = next;
      events.push(`${id}:min:${next}`);
    }),
    getCenterClampedToGround: vi.fn(() => currentCenterClamp),
    setCenterClampedToGround: vi.fn((next: boolean) => {
      currentCenterClamp = next;
      events.push(`${id}:center-clamp:${next}`);
    }),
  } as unknown as MaplibreMap;

  return map;
};

const propsFor = (libreMap: MaplibreMap): AddonComponentProps<"freeCamera"> =>
  ({
    libreMap,
    carma: {},
    leafletMap: null,
    store: {},
    target: null,
  } as AddonComponentProps<"freeCamera">);

describe("FreeCamera", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("applies the full MapLibre pitch range before auxiliary bounds and restores the map baseline", () => {
    const events: string[] = [];
    const map = createMap("map", events, {
      minPitch: 12,
      maxPitch: 70,
      centerClampedToGround: true,
    });
    vi.mocked(setCameraRestrictionOverride).mockImplementation(
      (_map, value) => {
        events.push(`map:override:${value?.maxPitch ?? "none"}`);
      }
    );

    const view = render(<FreeCamera {...propsFor(map)} />);
    expect(events).toEqual([
      `map:override:${FREE_CAMERA_MAX_PITCH}`,
      "map:min:0",
      "map:center-clamp:false",
    ]);

    view.unmount();
    expect(events.slice(-3)).toEqual([
      "map:override:none",
      "map:min:12",
      "map:center-clamp:true",
    ]);
  });

  it("cleans up the old map before applying the policy to a replacement map", () => {
    const events: string[] = [];
    const firstMap = createMap("first", events, {
      minPitch: 4,
      maxPitch: 60,
      centerClampedToGround: true,
    });
    const secondMap = createMap("second", events, {
      minPitch: 11,
      maxPitch: 80,
      centerClampedToGround: false,
    });
    vi.mocked(setCameraRestrictionOverride).mockImplementation((map, value) => {
      const id = map === firstMap ? "first" : "second";
      events.push(`${id}:override:${value?.maxPitch ?? "none"}`);
    });

    const view = render(<FreeCamera {...propsFor(firstMap)} />);
    events.length = 0;
    view.rerender(<FreeCamera {...propsFor(secondMap)} />);

    expect(events).toEqual([
      "first:override:none",
      "first:min:4",
      "first:center-clamp:true",
      `second:override:${FREE_CAMERA_MAX_PITCH}`,
      "second:min:0",
      "second:center-clamp:false",
    ]);

    view.unmount();
    expect(events.slice(-3)).toEqual([
      "second:override:none",
      "second:min:11",
      "second:center-clamp:false",
    ]);
  });

  it("does not leave a stale owner after React StrictMode replays its effect", () => {
    const events: string[] = [];
    const map = createMap("map", events);
    vi.mocked(setCameraRestrictionOverride).mockImplementation(
      (_map, value) => {
        events.push(`map:override:${value?.maxPitch ?? "none"}`);
      }
    );

    const view = render(
      <StrictMode>
        <FreeCamera {...propsFor(map)} />
      </StrictMode>
    );
    expect(events.filter((event) => event === "map:override:180")).toHaveLength(
      2
    );
    expect(
      events.filter((event) => event === "map:override:none")
    ).toHaveLength(1);
    expect(events.slice(-3)).toEqual([
      "map:override:180",
      "map:min:0",
      "map:center-clamp:false",
    ]);

    view.unmount();
    expect(events.slice(-3)).toEqual([
      "map:override:none",
      "map:min:8",
      "map:center-clamp:true",
    ]);
  });
});
