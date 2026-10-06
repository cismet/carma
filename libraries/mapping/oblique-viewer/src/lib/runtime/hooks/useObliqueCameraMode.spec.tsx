import { act, renderHook } from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { Degrees } from "@carma-units";
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
  settle: vi.fn(),
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

vi.mock("../utils/flyToImage", () => ({ settleToPitch: camera.settle }));

const deferredFlight = () => {
  let resolve!: () => void;
  const done = new Promise<void>((finished) => {
    resolve = finished;
  });
  return { done, cancel: vi.fn(resolve), finish: resolve };
};
const dataset = { pitchDeg: 45 } as ObliqueDataset;
const setup = (
  overrides: Partial<Parameters<typeof useObliqueCameraMode>[0]> = {}
) => {
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
  const props: Parameters<typeof useObliqueCameraMode>[0] = {
    map,
    enabled: true,
    dataset,
    onBeforeLeave: beforeLeave,
    ...overrides,
  };
  const view = renderHook(useObliqueCameraMode, { initialProps: props });
  return { ...view, map, props, enter, preparation, leave, beforeLeave };
};
beforeEach(() => {
  vi.clearAllMocks();
  camera.settle.mockReset().mockImplementation(() => deferredFlight());
});

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

describe("dataset browsing pitch updates", () => {
  it("changes only pitch while retaining the existing mode, terrain, zoom/FOV baseline and wheel state", async () => {
    const view = setup({ pitchDeg: 30 as Degrees });
    await finishEntry(view);
    expect(camera.enter).toHaveBeenCalledWith(
      view.map,
      expect.objectContaining({ pitchDeg: 30 })
    );
    view.map.setVerticalFieldOfView(2);
    vi.mocked(view.map.setVerticalFieldOfView).mockClear();
    const update = deferredFlight();
    camera.settle.mockReturnValue(update);
    view.rerender({ ...view.props, pitchDeg: 42 as Degrees });
    expect(camera.settle).toHaveBeenCalledWith(view.map, 42, {
      durationMs: 250,
    });
    expect(camera.enter).toHaveBeenCalledOnce();
    expect(camera.ensureTerrain).toHaveBeenCalledOnce();
    expect(view.map.scrollZoom.disable).toHaveBeenCalledOnce();
    expect(view.map.getVerticalFieldOfView()).toBe(2);
    expect(view.map.setVerticalFieldOfView).not.toHaveBeenCalled();
    expect(camera.lock).toHaveBeenLastCalledWith(view.map, 30);
    await act(async () => update.finish());
    expect(camera.lock).toHaveBeenLastCalledWith(view.map, 42);
    expect(view.result.current.phase).toBe("active");
    view.unmount();
  });

  it("retains preview pitch while suspended or manually freed and locks to the latest default on return", async () => {
    const view = setup();
    await finishEntry(view);
    const locks = camera.lock.mock.calls.length;
    view.rerender({ ...view.props, pitchDeg: 50 as Degrees, suspended: true });
    view.rerender({ ...view.props, pitchDeg: 55 as Degrees, suspended: true });
    expect(camera.settle).not.toHaveBeenCalled();
    expect(camera.lock).toHaveBeenCalledTimes(locks);
    act(() => view.result.current.freeCamera());
    view.rerender({ ...view.props, pitchDeg: 58 as Degrees, suspended: false });
    expect(camera.settle).not.toHaveBeenCalled();
    expect(camera.lock).toHaveBeenCalledTimes(locks);
    act(() => view.result.current.lockCamera());
    expect(camera.lock).toHaveBeenLastCalledWith(view.map, 58);
    expect(camera.enter).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("cancels outdated pitch flights and suspended updates without relocking to a stale mean", async () => {
    const view = setup();
    await finishEntry(view);
    const first = deferredFlight(),
      second = deferredFlight(),
      third = deferredFlight();
    camera.settle
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
      .mockReturnValueOnce(third);
    view.rerender({ ...view.props, pitchDeg: 40 as Degrees });
    view.rerender({ ...view.props, pitchDeg: 50 as Degrees });
    expect(first.cancel).toHaveBeenCalledOnce();
    await act(async () => {});
    expect(camera.lock).toHaveBeenLastCalledWith(view.map, 45);
    await act(async () => second.finish());
    expect(camera.lock).toHaveBeenLastCalledWith(view.map, 50);
    view.rerender({ ...view.props, pitchDeg: 60 as Degrees });
    view.rerender({ ...view.props, pitchDeg: 60 as Degrees, suspended: true });
    expect(third.cancel).toHaveBeenCalledOnce();
    await act(async () => {});
    expect(camera.lock).toHaveBeenLastCalledWith(view.map, 50);
    expect(camera.enter).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("cancels an active pitch adjustment when the photo camera is freed and keeps later defaults for the final lock", async () => {
    const view = setup();
    await finishEntry(view);
    const update = deferredFlight();
    camera.settle.mockReturnValue(update);
    view.rerender({ ...view.props, pitchDeg: 40 as Degrees });
    act(() => view.result.current.freeCamera());
    expect(update.cancel).toHaveBeenCalledOnce();
    await act(async () => {});
    expect(camera.lock).toHaveBeenLastCalledWith(view.map, 45);
    view.rerender({ ...view.props, pitchDeg: 56 as Degrees });
    expect(camera.settle).toHaveBeenCalledOnce();
    act(() => view.result.current.lockCamera());
    expect(camera.lock).toHaveBeenLastCalledWith(view.map, 56);
    view.unmount();
  });
});
