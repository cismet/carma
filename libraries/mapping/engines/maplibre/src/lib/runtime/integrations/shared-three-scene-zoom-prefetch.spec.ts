import {
  createProgressiveHost,
  expectMatrixToBeCloseTo,
} from "./shared-three-scene-layer.test-support";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TILE_CAMERA_ROLE } from "../../core/tile-camera-demand";
import { type SharedThreeSceneRuntime } from "../../core/shared-three-scene-types";

describe("zoom focus prefetch host", () => {
  let host: ReturnType<typeof createProgressiveHost>;
  const emit = (event: string, detail = {}) => {
    const listener = host.map.on.mock.calls.find(
      ([name]) => name === event
    )?.[1];
    expect(listener).toBeTypeOf("function");
    listener(detail);
  };
  const addRuntime = (
    id: string,
    overrides: Partial<SharedThreeSceneRuntime> = {}
  ) => {
    const runtime = {
      id,
      originLngLat: [7.15, 51.25] as const,
      root: new THREE.Group(),
      update: vi.fn<Parameters<SharedThreeSceneRuntime["update"]>, void>(),
      dispose: vi.fn(),
      getRequestDemand: vi.fn(() => 0),
      isBaseViewReady: vi.fn(() => true),
      prefetchZoom: vi.fn<
        Parameters<NonNullable<SharedThreeSceneRuntime["prefetchZoom"]>>,
        Promise<void>
      >(async () => {}),
      ...overrides,
    };
    host.layer.addRuntime(runtime);
    return runtime;
  };
  beforeEach(() => {
    vi.useFakeTimers();
    host = createProgressiveHost();
    host.layer.setAccumulationController(null);
    host.map.isZooming.mockReturnValue(true);
  });
  afterEach(() => {
    host.layer.dispose();
    vi.useRealTimers();
  });

  it("waits for every runtime's foreground and coarse coverage, then yields outside the draw callback", async () => {
    const mesh = addRuntime("mesh");
    const terrain = addRuntime("terrain", {
      getRequestDemand: vi.fn(() => 1),
      isBaseViewReady: vi.fn(() => false),
    });
    emit("zoomstart");
    host.render();
    await vi.advanceTimersByTimeAsync(0);
    expect(mesh.prefetchZoom).not.toHaveBeenCalled();
    vi.mocked(terrain.getRequestDemand).mockReturnValue(0);
    host.render();
    await vi.advanceTimersByTimeAsync(0);
    expect(mesh.prefetchZoom).not.toHaveBeenCalled();
    vi.mocked(terrain.isBaseViewReady).mockReturnValue(true);
    host.render();
    expect(mesh.prefetchZoom).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(mesh.prefetchZoom).toHaveBeenCalledOnce();
    expect(terrain.prefetchZoom).toHaveBeenCalledOnce();
    host.render();
    await vi.advanceTimersByTimeAsync(0);
    expect(mesh.prefetchZoom).toHaveBeenCalledOnce();
  });

  it.each([
    { input: {}, focus: [1100, 450], paddedCenter: [1100, 450] },
    { input: {}, focus: [1260, 490], paddedCenter: [1260, 490] },
    {
      input: { originalEvent: { clientX: 470, clientY: 320 } },
      focus: [440, 270],
      paddedCenter: [1260, 490],
    },
  ])(
    "crops an immutable camera snapshot around $focus in CSS pixels",
    async ({ input, focus, paddedCenter }) => {
      host.map.project.mockReturnValue({
        x: paddedCenter[0],
        y: paddedCenter[1],
      });
      const runtime = addRuntime("mesh");
      emit("zoomstart", input);
      host.render();
      const frame = vi.mocked(runtime.update).mock.calls.at(-1)![0];
      const originalProjection = frame.renderCamera.projectionMatrix.clone();
      const originalWorld = frame.renderCamera.matrixWorld.toArray();
      const [x, y] = focus;
      const sx = host.canvas.clientWidth / 128;
      const sy = host.canvas.clientHeight / 128;
      const expected = originalProjection
        .clone()
        .premultiply(
          new THREE.Matrix4().set(
            sx,
            0,
            0,
            -sx * ((2 * x) / host.canvas.clientWidth - 1),
            0,
            sy,
            0,
            -sy * (1 - (2 * y) / host.canvas.clientHeight),
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1
          )
        );
      await vi.advanceTimersByTimeAsync(0);
      expect(host.map.unproject).toHaveBeenCalledWith(focus);
      const [request] = vi.mocked(runtime.prefetchZoom).mock.calls[0];
      expect(request).toMatchObject({
        levels: 2,
        lngLat: [7.15, 51.25],
        camera: {
          viewport: [128, 128],
          role: TILE_CAMERA_ROLE.GEOMETRY,
          matrixWorld: originalWorld,
        },
      });
      expectMatrixToBeCloseTo(
        new THREE.Matrix4().fromArray(request.camera.projectionMatrix),
        expected
      );
      expectMatrixToBeCloseTo(
        frame.renderCamera.projectionMatrix,
        originalProjection
      );
      frame.renderCamera.projectionMatrix.identity();
      expectMatrixToBeCloseTo(
        new THREE.Matrix4().fromArray(request.camera.projectionMatrix),
        expected
      );
    }
  );

  it("resumes after foreground demand without repeating already-fulfilled adapters", async () => {
    let finish!: () => void;
    const first = addRuntime("mesh", {
      prefetchZoom: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      ),
    });
    const second = addRuntime("terrain");
    emit("zoomstart");
    host.render();
    await vi.advanceTimersByTimeAsync(0);
    expect(first.prefetchZoom).toHaveBeenCalledOnce();
    expect(second.prefetchZoom).not.toHaveBeenCalled();
    vi.mocked(second.getRequestDemand).mockReturnValue(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(second.prefetchZoom).not.toHaveBeenCalled();
    host.map.triggerRepaint.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(vi.getTimerCount()).toBe(0);
    expect(host.map.triggerRepaint).not.toHaveBeenCalled();
    vi.mocked(second.getRequestDemand).mockReturnValue(0);
    // A normal foreground-completion repaint supplies the next frame.
    host.render();
    await vi.advanceTimersByTimeAsync(0);
    expect(first.prefetchZoom).toHaveBeenCalledOnce();
    expect(second.prefetchZoom).toHaveBeenCalledOnce();
    host.render();
    await vi.advanceTimersByTimeAsync(0);
    expect(second.prefetchZoom).toHaveBeenCalledOnce();
  });

  it("aborts the active adapter on zoomend and never starts another adapter", async () => {
    let finish!: () => void;
    const first = addRuntime("mesh", {
      prefetchZoom: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      ),
    });
    const second = addRuntime("terrain");
    emit("zoomstart");
    host.render();
    await vi.advanceTimersByTimeAsync(0);
    const signal = vi.mocked(first.prefetchZoom).mock.calls[0][1];
    expect(signal.aborted).toBe(false);
    emit("zoomend");
    expect(signal.aborted).toBe(true);
    finish();
    host.render();
    await vi.advanceTimersByTimeAsync(0);
    expect(second.prefetchZoom).not.toHaveBeenCalled();
    expect(first.prefetchZoom).toHaveBeenCalledOnce();
  });

  it("rearms after coarse coverage changes during the initial yield, without polling", async () => {
    const mesh = addRuntime("mesh");
    const terrain = addRuntime("terrain");
    emit("zoomstart");
    host.render();
    vi.mocked(terrain.isBaseViewReady).mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(mesh.prefetchZoom).not.toHaveBeenCalled();
    expect(terrain.prefetchZoom).not.toHaveBeenCalled();
    host.map.triggerRepaint.mockClear();
    host.render();
    await vi.advanceTimersByTimeAsync(1000);
    expect(vi.getTimerCount()).toBe(0);
    expect(host.map.triggerRepaint).not.toHaveBeenCalled();
    vi.mocked(terrain.isBaseViewReady).mockReturnValue(true);
    host.render();
    await vi.advanceTimersByTimeAsync(0);
    expect(mesh.prefetchZoom).toHaveBeenCalledOnce();
    expect(terrain.prefetchZoom).toHaveBeenCalledOnce();
  });

  it("does not resume a pressure-deferred gesture after zoomend", async () => {
    const runtime = addRuntime("terrain");
    emit("zoomstart");
    host.render();
    vi.mocked(runtime.getRequestDemand).mockReturnValue(1);
    await vi.advanceTimersByTimeAsync(0);
    emit("zoomend");
    vi.mocked(runtime.getRequestDemand).mockReturnValue(0);
    host.render();
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.prefetchZoom).not.toHaveBeenCalled();
  });

  it("does not let a cancelled adapter completion consume work from the next gesture", async () => {
    let finishOld!: () => void;
    const prefetch = vi.fn<
      Parameters<NonNullable<SharedThreeSceneRuntime["prefetchZoom"]>>,
      Promise<void>
    >(async () => {});
    prefetch.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishOld = resolve;
        })
    );
    const first = addRuntime("mesh", { prefetchZoom: prefetch });
    const second = addRuntime("terrain");
    emit("zoomstart");
    host.render();
    await vi.advanceTimersByTimeAsync(0);
    const oldSignal = prefetch.mock.calls[0][1];
    emit("zoomend");
    emit("zoomstart");
    host.render();
    vi.mocked(second.getRequestDemand).mockReturnValue(1);
    await vi.advanceTimersByTimeAsync(0);
    finishOld();
    await vi.advanceTimersByTimeAsync(0);
    expect(oldSignal.aborted).toBe(true);
    expect(first.prefetchZoom).toHaveBeenCalledOnce();
    vi.mocked(second.getRequestDemand).mockReturnValue(0);
    host.render();
    await vi.advanceTimersByTimeAsync(0);
    expect(first.prefetchZoom).toHaveBeenCalledTimes(2);
    expect(second.prefetchZoom).toHaveBeenCalledOnce();
  });

  it.each(["before-ready", "before-next-task"])(
    "does not begin after zoomend (%s)",
    async (phase) => {
      const runtime = addRuntime("mesh");
      if (phase === "before-ready")
        vi.mocked(runtime.getRequestDemand).mockReturnValue(1);
      emit("zoomstart");
      host.render();
      emit("zoomend");
      vi.mocked(runtime.getRequestDemand).mockReturnValue(0);
      host.render();
      await vi.advanceTimersByTimeAsync(0);
      expect(runtime.prefetchZoom).not.toHaveBeenCalled();
    }
  );

  it("removes the exact zoom listeners and cancels scheduled work on disposal", async () => {
    const runtime = addRuntime("mesh");
    emit("zoomstart");
    host.render();
    host.layer.dispose();
    for (const event of ["zoomstart", "zoomend"]) {
      const listener = host.map.on.mock.calls.find(
        ([name]) => name === event
      )![1];
      expect(host.map.off).toHaveBeenCalledWith(event, listener);
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.prefetchZoom).not.toHaveBeenCalled();
  });
});
