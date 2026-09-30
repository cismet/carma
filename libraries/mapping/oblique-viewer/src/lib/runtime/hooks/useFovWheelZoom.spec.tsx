import { fireEvent, render, renderHook } from "@testing-library/react";
import type { Map as MaplibreMap, PaddingOptions } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { degToRad, type Degrees, type DevicePixels } from "@carma-units";

import { applyFovKeepingCamera, useFovWheelZoom } from "./useFovWheelZoom";

// Only the numeric camera geometry is under test; a WebGL map is unnecessary.
vi.mock("@carma-mapping/engines/maplibre", () => ({
  zoom512as256: (zoom: number) => zoom + 1,
  zoom256as512: (zoom: number) => zoom - 1,
}));
const animations = vi.hoisted(
  () =>
    [] as {
      next: number;
      apply: (fov: number) => void;
      complete: () => void;
      cancel: ReturnType<typeof vi.fn>;
    }[]
);
vi.mock("../utils/obliqueCamera", () => ({
  setFov: (map: MaplibreMap, fov: number) => map.setVerticalFieldOfView(fov),
  tweenFov: (
    _map: unknown,
    next: number,
    _duration: number,
    apply: (fov: number) => void,
    complete: () => void
  ) => {
    const animation = { next, apply, complete, cancel: vi.fn() };
    animations.push(animation);
    return animation;
  },
}));

beforeEach(() => {
  animations.length = 0;
  vi.stubGlobal("devicePixelRatio", 1);
});
afterEach(() => vi.unstubAllGlobals());

const setup = ({ maxZoom = 24 } = {}) => {
  let fov = 45,
    zoom = 16,
    maximumZoom = maxZoom;
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
    getMaxZoom: () => maximumZoom,
    setMaxZoom: vi.fn((value: number) => {
      maximumZoom = value;
      zoom = Math.min(zoom, maximumZoom);
    }),
    jumpTo: vi.fn((value: { zoom: number }) => {
      zoom = Math.min(value.zoom, maximumZoom);
    }),
    getContainer: () => container,
  } as unknown as MaplibreMap;
  return { map, host };
};

const physicalCameraDistance = (map: MaplibreMap): number =>
  map.transform.height /
  (2 * Math.tan(degToRad(map.getVerticalFieldOfView() as Degrees) / 2)) /
  2 ** map.getZoom();

const displayedLongEdgePixels = (
  map: MaplibreMap,
  halfFovTan: number,
  pixelRatio: number
): DevicePixels =>
  ((map.transform.height * halfFovTan * pixelRatio) /
    Math.tan(
      degToRad(map.getVerticalFieldOfView() as Degrees) / 2
    )) as DevicePixels;

const renderWheelZoom = (
  map: MaplibreMap,
  previewRoot: HTMLDivElement | null,
  previewSampling?: { longEdgePixels: DevicePixels; halfFovTan: number },
  onPreviewZoomEnd?: () => void
) =>
  renderHook(() =>
    useFovWheelZoom({
      map,
      enabled: true,
      minFovDeg: 10,
      maxFovDeg: 110,
      busyRef: { current: false },
      previewRoot,
      previewSampling,
      onPreviewZoomEnd,
    })
  );

const finishLastAnimation = () => {
  const animation = animations.at(-1)!;
  animation.apply(animation.next);
  animation.complete();
  return animation;
};

describe("off-centre image zoom", () => {
  it("keeps the pixel under the mouse fixed while retaining the physical camera distance", () => {
    const { map } = setup();
    const anchor = { x: 610, y: 380 };
    const before = { ...map.transform.centerOffset };
    const scale =
      Math.tan(degToRad(45 as Degrees) / 2) /
      Math.tan(degToRad(35 as Degrees) / 2);
    const distanceBefore = physicalCameraDistance(map);
    applyFovKeepingCamera(map, 35, anchor);
    const after = map.transform.centerOffset;
    expect((anchor.x - 400 - after.x) / scale).toBeCloseTo(
      anchor.x - 400 - before.x
    );
    expect((anchor.y - 300 - after.y) / scale).toBeCloseTo(
      anchor.y - 300 - before.y
    );
    expect(map.getZoom()).toBeCloseTo(16 + Math.log2(scale));
    expect(physicalCameraDistance(map)).toBeCloseTo(distanceBefore, 12);
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

  it.each([
    { label: "missing", x: undefined, y: undefined },
    { label: "nonfinite", x: Number.NaN, y: Number.POSITIVE_INFINITY },
    { label: "outside", x: 850, y: 420 },
  ])(
    "anchors $label cursor positions at the current 2D viewport centre",
    ({ x, y }) => {
      const { map, host } = setup();
      const view = renderWheelZoom(map, host);
      const before = { ...map.transform.centerOffset };
      const event = new WheelEvent("wheel", {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperties(event, {
        clientX: { value: x },
        clientY: { value: y },
      });
      fireEvent(host, event);
      finishLastAnimation();
      const scale =
        Math.tan(degToRad(45 as Degrees) / 2) /
        Math.tan(degToRad(map.getVerticalFieldOfView() as Degrees) / 2);
      expect(map.transform.centerOffset.x).toBeCloseTo(before.x * scale);
      expect(map.transform.centerOffset.y).toBeCloseTo(before.y * scale);
      view.unmount();
    }
  );

  it("retains the cursor anchor after panning beyond the viewport padding bounds", () => {
    const { map, host } = setup();
    map.setPadding({ left: 2000, right: 0, top: 0, bottom: 1800 });
    const view = renderWheelZoom(map, host);
    const before = { ...map.transform.centerOffset };
    const distanceBefore = physicalCameraDistance(map);
    fireEvent.wheel(host, { deltaY: -100, clientX: 640, clientY: 420 });
    finishLastAnimation();
    const scale =
      Math.tan(degToRad(45 as Degrees) / 2) /
      Math.tan(degToRad(map.getVerticalFieldOfView() as Degrees) / 2);
    const after = map.transform.centerOffset;
    expect(after.x).toBeGreaterThan(map.transform.width / 2);
    expect(after.y).toBeLessThan(-map.transform.height / 2);
    expect((610 - 400 - after.x) / scale).toBeCloseTo(610 - 400 - before.x);
    expect((380 - 300 - after.y) / scale).toBeCloseTo(380 - 300 - before.y);
    expect(physicalCameraDistance(map)).toBeCloseTo(distanceBefore, 12);
    view.unmount();
  });

  it.each([1, 2])(
    "limits the preview to 200%% of source pixels at DPR %s while allowing deeper than browsing zoom",
    (pixelRatio) => {
      vi.stubGlobal("devicePixelRatio", pixelRatio);
      const { map, host } = setup();
      const previewSampling = {
        longEdgePixels: 4000 as DevicePixels,
        halfFovTan: 0.3,
      };
      const onPreviewZoomEnd = vi.fn();
      const view = renderWheelZoom(
        map,
        host,
        previewSampling,
        onPreviewZoomEnd
      );
      const distanceBefore = physicalCameraDistance(map);
      fireEvent.wheel(host, { deltaY: -1000000, clientX: 640, clientY: 420 });
      const animation = finishLastAnimation();
      expect(animation.next).toBeLessThan(10);
      expect(
        displayedLongEdgePixels(map, previewSampling.halfFovTan, pixelRatio)
      ).toBeCloseTo(2 * previewSampling.longEdgePixels, 8);
      expect(physicalCameraDistance(map)).toBeCloseTo(distanceBefore, 12);
      expect(onPreviewZoomEnd).toHaveBeenCalledOnce();
      fireEvent.wheel(host, { deltaY: -1000000 });
      expect(animations).toHaveLength(1);
      view.unmount();
    }
  );

  it("retains the dataset minimum while browsing even when image sampling is available", () => {
    const { map, host } = setup();
    const onPreviewZoomEnd = vi.fn();
    const view = renderWheelZoom(
      map,
      null,
      { longEdgePixels: 2000 as DevicePixels, halfFovTan: 0.3 },
      onPreviewZoomEnd
    );
    const paddingBefore = { ...map.transform.centerOffset };
    fireEvent.wheel(host, { deltaY: -1000000, clientX: 640, clientY: 420 });
    const animation = finishLastAnimation();
    expect(animation.next).toBe(10);
    expect(map.transform.centerOffset).toEqual(paddingBefore);
    expect(onPreviewZoomEnd).not.toHaveBeenCalled();
    view.unmount();
  });

  it("retains the dataset minimum for a preview without native image sampling", () => {
    const { map, host } = setup();
    const view = renderWheelZoom(map, host);
    fireEvent.wheel(host, { deltaY: -1000000 });
    expect(finishLastAnimation().next).toBe(10);
    view.unmount();
  });

  it("preserves browsing maxZoom before compensation can move the physical camera", () => {
    const { map, host } = setup({ maxZoom: 18 });
    const view = renderWheelZoom(map, null, {
      longEdgePixels: 10000 as DevicePixels,
      halfFovTan: 0.3,
    });
    const distanceBefore = physicalCameraDistance(map);
    fireEvent.wheel(host, { deltaY: -1000000 });
    const animation = finishLastAnimation();
    expect(animation.next).toBeGreaterThan(10);
    expect(map.getMaxZoom()).toBe(18);
    expect(map.getZoom()).toBeCloseTo(18, 12);
    expect(physicalCameraDistance(map)).toBeCloseTo(distanceBefore, 12);
    expect(map.jumpTo).toHaveBeenLastCalledWith(
      { zoom: map.getZoom() },
      { obliqueFov: true }
    );
    fireEvent.wheel(host, { deltaY: -1000000 });
    expect(animations).toHaveLength(1);
    view.unmount();
  });

  it("temporarily extends map maxZoom 22 so the preview can reach 200% of native pixels", () => {
    const { map, host } = setup({ maxZoom: 22 });
    const previewSampling = {
      longEdgePixels: 20000 as DevicePixels,
      halfFovTan: 0.3,
    };
    const view = renderWheelZoom(map, host, previewSampling);
    const distanceBefore = physicalCameraDistance(map);
    fireEvent.wheel(host, { deltaY: -1000000, clientX: 640, clientY: 420 });
    finishLastAnimation();
    expect(map.getZoom()).toBeGreaterThan(22);
    expect(map.getMaxZoom()).toBeGreaterThan(map.getZoom());
    expect(
      displayedLongEdgePixels(map, previewSampling.halfFovTan, 1)
    ).toBeCloseTo(2 * previewSampling.longEdgePixels, 8);
    expect(physicalCameraDistance(map)).toBeCloseTo(distanceBefore, 12);
    view.unmount();
    expect(map.getMaxZoom()).toBe(22);
    expect(map.getZoom()).toBeLessThanOrEqual(22);
    expect(physicalCameraDistance(map)).toBeCloseTo(distanceBefore, 12);
  });

  it("keeps the preview limit across sampling changes, restores it on exit, and reacquires it on reentry", () => {
    const { map, host } = setup({ maxZoom: 22 });
    const props = {
      map,
      enabled: true,
      minFovDeg: 10,
      maxFovDeg: 110,
      busyRef: { current: false },
      previewRoot: host as HTMLDivElement | null,
      previewSampling: {
        longEdgePixels: 20000 as DevicePixels,
        halfFovTan: 0.3,
      },
    };
    const view = renderHook(useFovWheelZoom, { initialProps: props });
    const distanceBefore = physicalCameraDistance(map);
    fireEvent.wheel(host, { deltaY: -1000000 });
    finishLastAnimation();
    const raisedMaximumZoom = map.getMaxZoom();
    const previewZoom = map.getZoom();
    view.rerender({
      ...props,
      previewSampling: {
        ...props.previewSampling,
        longEdgePixels: 40000 as DevicePixels,
      },
    });
    expect(map.getMaxZoom()).toBe(raisedMaximumZoom);
    expect(map.getZoom()).toBe(previewZoom);
    view.rerender({ ...props, previewRoot: null });
    expect(map.getMaxZoom()).toBe(22);
    expect(map.getZoom()).toBeLessThanOrEqual(22);
    expect(physicalCameraDistance(map)).toBeCloseTo(distanceBefore, 12);
    view.rerender(props);
    fireEvent.wheel(host, { deltaY: -1000000 });
    finishLastAnimation();
    expect(map.getZoom()).toBeGreaterThan(22);
    expect(
      displayedLongEdgePixels(map, props.previewSampling.halfFovTan, 1)
    ).toBeCloseTo(2 * props.previewSampling.longEdgePixels, 8);
    view.unmount();
    expect(map.getMaxZoom()).toBe(22);
    expect(physicalCameraDistance(map)).toBeCloseTo(distanceBefore, 12);
  });

  it("protects the camera and pointer anchor if an applied FOV would exceed map maxZoom", () => {
    const { map } = setup({ maxZoom: 17 });
    const anchor = { x: 610, y: 380 };
    const before = { ...map.transform.centerOffset };
    const distanceBefore = physicalCameraDistance(map);
    applyFovKeepingCamera(map, 2, anchor);
    expect(map.getZoom()).toBe(17);
    expect(map.getVerticalFieldOfView()).toBeGreaterThan(2);
    expect(physicalCameraDistance(map)).toBeCloseTo(distanceBefore, 12);
    const scale =
      Math.tan(degToRad(45 as Degrees) / 2) /
      Math.tan(degToRad(map.getVerticalFieldOfView() as Degrees) / 2);
    expect((anchor.x - 400 - map.transform.centerOffset.x) / scale).toBeCloseTo(
      anchor.x - 400 - before.x
    );
    expect((anchor.y - 300 - map.transform.centerOffset.y) / scale).toBeCloseTo(
      anchor.y - 300 - before.y
    );
  });
});
