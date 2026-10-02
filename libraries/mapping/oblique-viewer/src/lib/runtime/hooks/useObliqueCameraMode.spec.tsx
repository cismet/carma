import { act, renderHook } from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ObliqueDataset } from "../../core/types";
import { useObliqueCameraMode } from "./useObliqueCameraMode";

const camera = vi.hoisted(() => ({
  enter: vi.fn(),
  leave: vi.fn(),
  free: vi.fn(),
  lock: vi.fn(),
  release: vi.fn(),
  ensureTerrain: vi.fn(() => true),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  WUPPERTAL_TERRAIN_SOURCE_ID: "terrain",
  getCameraRestriction: () => ({ restricted: true }),
}));
vi.mock("../utils/obliqueCamera", () => ({
  enterObliqueView: camera.enter,
  leaveObliqueView: camera.leave,
  freePitch: camera.free,
  lockPitch: camera.lock,
  releaseCamera: camera.release,
  ensureTerrain: camera.ensureTerrain,
}));

const deferredFlight = () => {
  let resolve!: () => void;
  const done = new Promise<void>((finished) => {
    resolve = finished;
  });
  return { done, cancel: vi.fn(resolve), finish: resolve };
};
const dataset = { pitchDeg: 45 } as ObliqueDataset;
const setup = () => {
  let fov = 45;
  const map = {
    getVerticalFieldOfView: () => fov,
    setVerticalFieldOfView: vi.fn((next: number) => {
      fov = next;
    }),
    scrollZoom: { disable: vi.fn(), enable: vi.fn() },
    setTerrain: vi.fn(),
  } as unknown as MaplibreMap;
  const enter = deferredFlight(),
    preparation = deferredFlight(),
    leave = deferredFlight();
  camera.enter.mockReturnValue(enter);
  camera.leave.mockReturnValue(leave);
  const beforeLeave = vi.fn(() => preparation);
  const props = { map, enabled: true, dataset, onBeforeLeave: beforeLeave };
  const view = renderHook(useObliqueCameraMode, { initialProps: props });
  return { ...view, map, props, enter, preparation, leave, beforeLeave };
};
beforeEach(() => vi.clearAllMocks());

const finishEntry = async (view: ReturnType<typeof setup>) => {
  await act(async () => {});
  await act(async () => view.enter.finish());
  expect(view.result.current.phase).toBe("active");
};

describe("oblique preview return lifecycle", () => {
  it("completes the preview return before tilting out and releasing the normal camera", async () => {
    const view = setup();
    await finishEntry(view);
    view.rerender({ ...view.props, enabled: false });
    expect(view.beforeLeave).toHaveBeenCalledOnce();
    expect(camera.leave).not.toHaveBeenCalled();
    expect(view.result.current.phase).toBe("leaving");
    await act(async () => view.preparation.finish());
    expect(camera.leave).toHaveBeenCalledWith(view.map, dataset, 45, 250);
    expect(camera.release).not.toHaveBeenCalled();
    await act(async () => view.leave.finish());
    expect(view.result.current.phase).toBe("idle");
    expect(camera.release).toHaveBeenCalledOnce();
    expect(view.map.scrollZoom.enable).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("releases camera, terrain and wheel handling if unmounted during the return", async () => {
    const view = setup();
    await finishEntry(view);
    view.map.setVerticalFieldOfView(2);
    view.rerender({ ...view.props, enabled: false });
    view.unmount();
    expect(view.preparation.cancel).toHaveBeenCalled();
    expect(camera.release).toHaveBeenCalledOnce();
    expect(view.map.scrollZoom.enable).toHaveBeenCalledOnce();
    expect(view.map.setTerrain).toHaveBeenCalledWith(null);
    expect(view.map.setVerticalFieldOfView).toHaveBeenLastCalledWith(45);
    await act(async () => {});
    expect(camera.leave).not.toHaveBeenCalled();
  });

  it("waits for an unfinished return on reenable and preserves the original camera baseline", async () => {
    const view = setup();
    await finishEntry(view);
    view.map.setVerticalFieldOfView(2);
    view.rerender({ ...view.props, enabled: false });
    const nextEntry = deferredFlight();
    camera.enter.mockReturnValue(nextEntry);
    view.rerender(view.props);
    await act(async () => {});
    expect(view.preparation.cancel).not.toHaveBeenCalled();
    expect(camera.enter).toHaveBeenCalledOnce();
    expect(camera.ensureTerrain).toHaveBeenCalledOnce();
    await act(async () => view.preparation.finish());
    expect(camera.enter).toHaveBeenCalledTimes(2);
    expect(camera.leave).not.toHaveBeenCalled();
    await act(async () => nextEntry.finish());
    view.rerender({ ...view.props, enabled: false });
    await act(async () => {});
    expect(camera.leave).toHaveBeenCalledWith(view.map, dataset, 45, 250);
    view.unmount();
  });
});
