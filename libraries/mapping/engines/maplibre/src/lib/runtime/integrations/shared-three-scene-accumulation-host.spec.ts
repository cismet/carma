import { createProgressiveHost } from "./shared-three-scene-layer.test-support";
import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSharedSceneAccumulator } from "@carma-mapping/engines/three/primitives/rendering";
import { synthesizeLodCamera } from "@carma-mapping/engines/threejs";
import { getMapLoadingProgress } from "./map-loading-progress";

describe("progressive strategy host", () => {
  it("passes runtime presentation changes without changing the camera or shadow epoch", () => {
    const host = createProgressiveHost();
    let revision = 0;
    host.layer.addRuntime({
      id: "annotations",
      originLngLat: [0, 0],
      root: new THREE.Group(),
      getPresentationRevision: () => revision,
      update: () => {},
      dispose: () => {},
    });
    const frames: {
      presentationRevision?: string;
      viewKey: string;
      styleEpoch: number;
    }[] = [];
    host.controller.renderProgressive = vi.fn((_camera, frame) => {
      frames.push(frame);
      return { progress: 1, settled: true, needsRepaint: false };
    });
    try {
      host.render();
      revision += 1;
      host.render();
      expect(frames.map((frame) => frame.presentationRevision)).toEqual([
        "annotations:0",
        "annotations:1",
      ]);
      expect(frames[1].viewKey).toBe(frames[0].viewKey);
      expect(frames[1].styleEpoch).toBe(frames[0].styleEpoch);
    } finally {
      host.layer.dispose();
    }
  });

  it("keeps failed corridor publication pending and retries without a frame-rate loop", () => {
    vi.useFakeTimers();
    const host = createProgressiveHost();
    try {
      host.controller.renderProgressive = vi.fn(() => ({
        progress: 0.99,
        settled: false,
        needsRepaint: false,
        retryAfterMs: 250,
      }));
      host.render();
      expect(getMapLoadingProgress(host.map as never)).toMatchObject({
        active: true,
        percent: 99,
      });
      expect(host.map.triggerRepaint).not.toHaveBeenCalled();
      vi.advanceTimersByTime(249);
      expect(host.map.triggerRepaint).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(host.map.triggerRepaint).toHaveBeenCalledOnce();
      host.controller.renderProgressive = vi.fn(() => ({
        progress: 1,
        settled: true,
        needsRepaint: false,
      }));
      host.render();
      expect(getMapLoadingProgress(host.map as never)).toMatchObject({
        active: false,
        percent: 100,
      });
      vi.advanceTimersByTime(1000);
      expect(host.map.triggerRepaint).toHaveBeenCalledOnce();
    } finally {
      host.layer.dispose();
      vi.useRealTimers();
    }
  });

  it("cancels a queued corridor retry on disposal", () => {
    vi.useFakeTimers();
    const host = createProgressiveHost();
    try {
      host.controller.renderProgressive = vi.fn(() => ({
        progress: 0.99,
        settled: false,
        needsRepaint: false,
        retryAfterMs: 250,
      }));
      host.render();
      host.layer.dispose();
      vi.advanceTimersByTime(1000);
      expect(host.map.triggerRepaint).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  const mono = {
    broken: false,
    converged: false,
    hasSettledFrame: false,
    nextRound: 0,
    ensureState: vi.fn(),
    renderRound: vi.fn(),
    composite: vi.fn(() => true),
    dispose: vi.fn(),
  };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildSharedSceneAccumulator).mockReturnValue(mono as never);
  });

  it("redraws mono scene colour when only overlays change at a stationary camera", () => {
    const host = createProgressiveHost();
    let revision = 0;
    let retainedKey = "";
    host.layer.addRuntime({
      id: "annotations",
      originLngLat: [0, 0],
      root: new THREE.Group(),
      getPresentationRevision: () => revision,
      update: () => {},
      dispose: () => {},
    });
    mono.converged = false;
    mono.hasSettledFrame = false;
    mono.nextRound = 0;
    mono.ensureState.mockImplementation((key: string) => {
      if (retainedKey !== key) {
        retainedKey = key;
        mono.converged = false;
        mono.nextRound = 0;
      }
    });
    mono.renderRound.mockImplementation((_renderer, _width, _height, draw) => {
      draw();
      mono.converged = true;
      mono.hasSettledFrame = true;
      mono.nextRound += 1;
    });
    try {
      host.render();
      host.render();
      expect(mono.renderRound).toHaveBeenCalledOnce();
      revision += 1;
      host.render();
      expect(mono.renderRound).toHaveBeenCalledTimes(2);
      expect(host.controller.epoch()).toBe(0);
    } finally {
      host.layer.dispose();
      mono.ensureState.mockReset();
      mono.renderRound.mockReset();
      mono.converged = false;
      mono.hasSettledFrame = false;
      mono.nextRound = 0;
    }
  });

  it.each([true, false])(
    "lets a handled corridor own integration while active=%s",
    (active) => {
      const host = createProgressiveHost();
      const renderer = host.layer.getRenderer()!;
      const depthsAtTarget: unknown[][] = [];
      host.controller.active = () => active;
      host.controller.renderProgressive = vi.fn((_camera, frame) => {
        expect(frame).toMatchObject({ width: 4400, height: 1800, active });
        expect(frame.viewKey).toContain("4400.00,1800.00");
        expect(frame.styleEpoch).toBe(1);
        renderer.setRenderTarget({} as THREE.WebGLRenderTarget);
        depthsAtTarget.push(host.gl.depthRange.mock.lastCall!);
        renderer.setRenderTarget(null);
        depthsAtTarget.push(host.gl.depthRange.mock.lastCall!);
        return { progress: 1, settled: true, needsRepaint: false };
      });

      host.render();

      expect(host.controller.renderProgressive).toHaveBeenCalledOnce();
      expect(depthsAtTarget).toEqual([
        [0, 1],
        [0, 0.985],
      ]);
      expect(host.gl.bindFramebuffer).toHaveBeenCalledWith(
        host.gl.FRAMEBUFFER,
        host.hostFramebuffer
      );
      expect(host.gl.depthRange).toHaveBeenLastCalledWith(0, 0.985);
      expect(renderer.setViewport).toHaveBeenLastCalledWith(0, 0, 4400, 1800);
      expect(buildSharedSceneAccumulator).not.toHaveBeenCalled();
      expect(host.controller.prepareRound).not.toHaveBeenCalled();
      expect(renderer.render).not.toHaveBeenCalled();
      expect(host.controller.onSettled).toHaveBeenCalledOnce();
      expect(host.map.triggerRepaint).not.toHaveBeenCalled();
      expect(host.canvas).toMatchObject({
        width: 4400,
        height: 1800,
        clientWidth: 2200,
      });
      host.layer.dispose();
    }
  );

  it("never starts mono accumulation when the selected progressive strategy is pending", () => {
    const host = createProgressiveHost();
    host.controller.renderProgressive = vi.fn(() => null);

    host.render();

    expect(buildSharedSceneAccumulator).not.toHaveBeenCalled();
    expect(host.controller.prepareRound).not.toHaveBeenCalled();
    expect(mono.renderRound).not.toHaveBeenCalled();
    expect(mono.composite).not.toHaveBeenCalled();
    expect(host.controller.finishRound).not.toHaveBeenCalled();
    expect(host.map.triggerRepaint).not.toHaveBeenCalled();
    host.layer.dispose();
  });

  it("passes the explicit MapLibre center elevation to the LOD camera", () => {
    const host = createProgressiveHost();
    Object.assign(host.map, { getCenterElevation: () => 200 });

    host.render();

    expect(vi.mocked(synthesizeLodCamera)).toHaveBeenCalled();
    const frame = vi.mocked(synthesizeLodCamera).mock.calls.at(-1)?.[2];
    expect(frame?.centerElevationMeters).toBe(200);
    host.layer.dispose();
  });

  it("acknowledges completed shadow presentation, never a pending progressive frame", () => {
    const host = createProgressiveHost();
    host.controller.renderProgressive = () => ({
      progress: 0.5,
      settled: false,
      needsRepaint: true,
    });
    host.render();
    expect(host.controller.onPresented).not.toHaveBeenCalled();
    host.controller.renderProgressive = () => ({
      progress: 1,
      settled: true,
      needsRepaint: false,
    });
    host.render();
    expect(host.controller.onPresented).toHaveBeenCalledOnce();
    host.layer.dispose();
  });

  it("releases obsolete mono buffers while time changes and recreates them only after settling", () => {
    const host = createProgressiveHost();
    const renderer = host.layer.getRenderer()!;
    mono.renderRound.mockImplementationOnce(() => {
      mono.converged = true;
      mono.hasSettledFrame = true;
    });
    host.controller.retainSettledFrame = () => true;
    try {
      host.render();
      vi.clearAllMocks();
      host.controller.active = () => false;
      host.controller.pending = () => true;
      // Waiting geometry may reuse the same sun, never the previous time.
      host.render();
      expect(mono.composite).toHaveBeenCalledOnce();
      expect(renderer.render).not.toHaveBeenCalled();
      vi.clearAllMocks();
      for (const epoch of [1, 2]) {
        host.controller.visualEpoch = () => epoch;
        host.render();
      }
      expect(mono.dispose).toHaveBeenCalledOnce();
      expect(buildSharedSceneAccumulator).not.toHaveBeenCalled();
      expect(mono.composite).not.toHaveBeenCalled();
      expect(renderer.render).toHaveBeenCalledTimes(2);
      host.controller.active = () => true;
      host.render();
      expect(buildSharedSceneAccumulator).toHaveBeenCalledOnce();
    } finally {
      mono.converged = false;
      mono.hasSettledFrame = false;
      host.layer.dispose();
    }
  });

  it("releases previous mono targets without averaging a corridor-owned frame", () => {
    const host = createProgressiveHost();
    host.controller.renderProgressive = undefined;
    host.render();
    vi.clearAllMocks();
    host.controller.renderProgressive = vi.fn(() => ({
      progress: 0.5,
      settled: false,
      needsRepaint: true,
    }));

    host.render();

    expect(mono.dispose).toHaveBeenCalledOnce();
    expect(mono.renderRound).not.toHaveBeenCalled();
    expect(mono.composite).not.toHaveBeenCalled();
    expect(buildSharedSceneAccumulator).not.toHaveBeenCalled();
    expect(host.controller.prepareRound).not.toHaveBeenCalled();
    expect(host.map.triggerRepaint).toHaveBeenCalledOnce();
    expect(host.controller.onSettled).not.toHaveBeenCalled();
    host.layer.dispose();
  });
});
