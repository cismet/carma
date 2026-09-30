import { render, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap, PaddingOptions } from "maplibre-gl";
import { applyFovKeepingCamera, useFovWheelZoom } from "./useFovWheelZoom";

// Only the numeric camera geometry is under test; a WebGL map is unnecessary.
vi.mock("@carma-mapping/engines/maplibre", () => ({
  zoom512as256: (zoom: number) => zoom + 1,
  zoom256as512: (zoom: number) => zoom - 1,
}));
const animations = vi.hoisted(
  () =>
    [] as { apply: (fov: number) => void; cancel: ReturnType<typeof vi.fn> }[]
);
vi.mock("../utils/obliqueCamera", () => ({
  setFov: (map: MaplibreMap, fov: number) => map.setVerticalFieldOfView(fov),
  tweenFov: (
    _map: unknown,
    _next: number,
    _duration: number,
    apply: (fov: number) => void
  ) => {
    const animation = { apply, cancel: vi.fn() };
    animations.push(animation);
    return animation;
  },
}));

const setup = () => {
  let fov = 45,
    zoom = 16;
  let padding: PaddingOptions = { left: 200, right: 0, top: 0, bottom: 80 };
  const container = document.createElement("div");
  const host = document.createElement("div");
  host.append(container);
  container.getBoundingClientRect = () => ({ left: 30, top: 40 } as DOMRect);
  const map = {
    transform: {
      width: 800,
      height: 600,
      get centerOffset() {
        return {
          x: (padding.left - padding.right) / 2,
          y: (padding.top - padding.bottom) / 2,
        };
      },
    },
    getPadding: () => padding,
    setPadding: vi.fn((value: PaddingOptions) => {
      padding = value;
    }),
    getVerticalFieldOfView: () => fov,
    setVerticalFieldOfView: (value: number) => {
      fov = value;
    },
    getZoom: () => zoom,
    jumpTo: vi.fn((value: { zoom: number }) => {
      zoom = value.zoom;
    }),
    getContainer: () => container,
  } as unknown as MaplibreMap;
  return { map, host };
};

describe("off-centre image zoom", () => {
  it("keeps the pixel under the mouse fixed while retaining the physical camera distance", () => {
    const { map } = setup();
    const anchor = { x: 610, y: 380 };
    const before = { ...map.transform.centerOffset };
    const scale =
      Math.tan((Math.PI * 45) / 360) / Math.tan((Math.PI * 35) / 360);
    applyFovKeepingCamera(map, 35, anchor);
    const after = map.transform.centerOffset;
    expect((anchor.x - 400 - after.x) / scale).toBeCloseTo(
      anchor.x - 400 - before.x
    );
    expect((anchor.y - 300 - after.y) / scale).toBeCloseTo(
      anchor.y - 300 - before.y
    );
    expect(map.getZoom()).toBeCloseTo(16 + Math.log2(scale));
    expect(map.jumpTo).toHaveBeenLastCalledWith(
      { zoom: map.getZoom() },
      { obliqueFov: true }
    );
  });
  it("uses the pointer position and cancels pending zoom when a flight begins", () => {
    const { map, host } = setup();
    const busyRef = { current: false };
    const Harness = () => {
      useFovWheelZoom({
        map,
        enabled: true,
        minFovDeg: 2,
        maxFovDeg: 90,
        busyRef,
        previewRoot: host,
      });
      return null;
    };
    const view = render(<Harness />);
    fireEvent.wheel(host, { deltaY: -100, clientX: 640, clientY: 420 });
    const animation = animations.at(-1)!;
    animation.apply(35);
    expect(map.transform.centerOffset.x).toBeLessThan(100);
    expect(map.transform.centerOffset.y).toBeLessThan(-40);
    busyRef.current = true;
    const count = animations.length;
    fireEvent.wheel(host, { deltaY: -100 });
    expect(animations).toHaveLength(count);
    const fov = map.getVerticalFieldOfView();
    animation.apply(30);
    expect(map.getVerticalFieldOfView()).toBe(fov);
    expect(animation.cancel).toHaveBeenCalledOnce();
    view.unmount();
    expect(animation.cancel).toHaveBeenCalledOnce();
  });
});
