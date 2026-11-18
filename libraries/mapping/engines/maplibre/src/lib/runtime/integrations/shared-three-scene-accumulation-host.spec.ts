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
    mono.ensureState.mockReset();
    mono.renderRound.mockReset();
    mono.composite.mockReset().mockReturnValue(true);
    Object.assign(mono, {
      broken: false,
      converged: false,
      hasSettledFrame: false,
      nextRound: 0,
    });
    vi.mocked(buildSharedSceneAccumulator).mockReturnValue(mono as never);
  });

  const addOverlay = (
    host: ReturnType<typeof createProgressiveHost>,
    visible = true
  ) => {
    let revision = 0;
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial()
    );
    mesh.castShadow = true;
    root.add(mesh);
    root.visible = visible;
    host.layer.addRuntime({
      id: "measurement-overlay",
      originLngLat: [0, 0],
      root,
      renderAsOverlay: true,
      getPresentationRevision: () => revision,
      update: () => {},
      dispose: () => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      },
    });
    return {
      root,
      mesh,
      change: () => {
        revision += 1;
      },
    };
  };

  it("dispatches scoped runtime callbacks inside host depth/tone/shadow guards and retains the default draw", () => {
    const host = createProgressiveHost();
    const ordinary = addOverlay(host);
    const root = new THREE.Group();
    const renderer = host.layer.getRenderer()!;
    const callback = vi.fn(
      (
        activeRenderer: THREE.WebGLRenderer,
        frame: Parameters<
          NonNullable<
            import("../../core/shared-three-scene-types").SharedThreeSceneRuntime["renderOverlay"]
          >
        >[1]
      ) => {
        expect(activeRenderer).toBe(renderer);
        expect(frame.map).toBe(host.map);
        expect(root.visible).toBe(true);
        expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
        expect(renderer.shadowMap.enabled).toBe(false);
        expect(host.gl.depthRange).toHaveBeenLastCalledWith(0, 0.985);
        expect(host.gl.getParameter(host.gl.FRAMEBUFFER_BINDING)).toBe(
          host.hostFramebuffer
        );
        activeRenderer.render(root, frame.renderCamera);
      }
    );
    host.layer.addRuntime({
      id: "scoped-overlay",
      originLngLat: [0, 0],
      root,
      renderAsOverlay: true,
      renderOverlay: callback,
      update: () => {},
      dispose: () => {},
    });
    host.controller.renderProgressive = vi.fn(() => ({
      progress: 1,
      settled: true,
      needsRepaint: false,
    }));
    try {
      host.render();
      host.render();
      expect(callback).toHaveBeenCalledTimes(2);
      const draws = vi
        .mocked(renderer.render)
        .mock.calls.map(([object]) => object);
      expect(draws.filter((object) => object === root)).toHaveLength(2);
      expect(draws.filter((object) => object === ordinary.root)).toHaveLength(
        2
      );
      expect(draws).toHaveLength(4);
      expect(renderer.toneMapping).toBe(THREE.AgXToneMapping);
      expect(renderer.shadowMap.enabled).toBe(true);
    } finally {
      host.layer.dispose();
    }
  });

  it("restores host renderer/depth/framebuffer state when an optional overlay callback throws", () => {
    const host = createProgressiveHost();
    host.layer.setAccumulationController(null);
    const root = new THREE.Group(),
      renderer = host.layer.getRenderer()!;
    renderer.toneMapping = THREE.AgXToneMapping;
    let scopeActive = false;
    host.layer.addRuntime({
      id: "throwing-scoped-overlay",
      originLngLat: [0, 0],
      root,
      renderAsOverlay: true,
      renderOverlay: () => {
        scopeActive = true;
        try {
          expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
          expect(renderer.shadowMap.enabled).toBe(false);
          throw new Error("masked callback failed");
        } finally {
          scopeActive = false;
        }
      },
      update: () => {},
      dispose: () => {},
    });
    try {
      expect(() => host.render()).toThrow("masked callback failed");
      expect(scopeActive).toBe(false);
      expect(root.visible).toBe(true);
      expect(renderer.toneMapping).toBe(THREE.AgXToneMapping);
      expect(renderer.shadowMap.enabled).toBe(true);
      expect(host.gl.depthRange).toHaveBeenLastCalledWith(0, 0.985);
      expect(host.gl.getParameter(host.gl.FRAMEBUFFER_BINDING)).toBe(
        host.hostFramebuffer
      );
      expect(renderer.render).not.toHaveBeenCalledWith(root, expect.anything());
    } finally {
      host.layer.dispose();
    }
  });

  it("keeps world samples converging while same-scene measurement overlays change live", () => {
    const host = createProgressiveHost();
    const overlay = addOverlay(host);
    const renderer = host.layer.getRenderer()!;
    const events: string[] = [];
    const casters: THREE.Object3D[] = [];
    let retainedKey = "";
    mono.ensureState.mockImplementation((key: string) => {
      if (key !== retainedKey) {
        retainedKey = key;
        mono.nextRound = 0;
        mono.converged = false;
      }
    });
    mono.renderRound.mockImplementation((_renderer, _width, _height, draw) => {
      draw();
      mono.nextRound += 1;
      mono.converged = mono.nextRound === 3;
      mono.hasSettledFrame = mono.converged;
    });
    mono.composite.mockImplementation(() => {
      expect(overlay.root.visible).toBe(false);
      renderer.setRenderTarget(null);
      events.push("composite");
      return true;
    });
    vi.mocked(renderer.render).mockImplementation((object) => {
      if (object === overlay.root) {
        expect(overlay.root.visible).toBe(true);
        expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
        expect(renderer.shadowMap.enabled).toBe(false);
        expect(host.gl.depthRange).toHaveBeenLastCalledWith(0, 0.985);
        expect(events.at(-1)).toBe("composite");
        events.push("overlay");
      } else {
        expect(object).toBe(host.layer.getScene());
        expect(overlay.root.visible).toBe(false);
        expect(renderer.toneMapping).toBe(THREE.AgXToneMapping);
        events.push("world");
      }
      if (renderer.shadowMap.enabled)
        object.traverseVisible((node) => {
          if ((node as THREE.Mesh).castShadow) casters.push(node);
        });
    });
    host.gl.clear.mockImplementation(() => {
      expect(events.at(-1)).toBe("overlay");
      events.push("clear");
    });
    try {
      for (let frame = 0; frame < 4; frame += 1) {
        overlay.change();
        host.render();
      }
      expect(mono.renderRound).toHaveBeenCalledTimes(3);
      expect(vi.mocked(host.controller.prepareRound).mock.calls).toEqual([
        [0],
        [1],
        [2],
      ]);
      expect(mono.converged).toBe(true);
      expect(
        new Set(mono.ensureState.mock.calls.map(([key]) => key)).size
      ).toBe(1);
      expect(events.filter((event) => event === "overlay")).toHaveLength(4);
      expect(casters).not.toContain(overlay.mesh);
      expect(overlay.root.userData.renderAsOverlay).toBe(true);
      expect(overlay.root.parent).not.toBeNull();
      expect(host.layer.getScene()!.getObjectById(overlay.root.id)).toBe(
        overlay.root
      );
      expect(renderer.toneMapping).toBe(THREE.AgXToneMapping);
      expect(renderer.shadowMap.enabled).toBe(true);
      expect(host.controller.onSettled).toHaveBeenCalledOnce();
    } finally {
      host.layer.dispose();
    }
  });

  it("draws live overlays after a tiled strategy reuses its world frame", () => {
    const host = createProgressiveHost();
    const overlay = addOverlay(host);
    const renderer = host.layer.getRenderer()!;
    const revisions: unknown[] = [];
    host.controller.renderProgressive = vi.fn((_camera, frame) => {
      expect(overlay.root.visible).toBe(false);
      revisions.push(frame.presentationRevision);
      return { progress: 1, settled: true, needsRepaint: false };
    });
    try {
      host.render();
      overlay.change();
      host.render();
      expect(revisions).toEqual(["", ""]);
      expect(mono.renderRound).not.toHaveBeenCalled();
      expect(renderer.render).toHaveBeenCalledTimes(2);
      expect(
        vi
          .mocked(renderer.render)
          .mock.calls.every(([object]) => object === overlay.root)
      ).toBe(true);
    } finally {
      host.layer.dispose();
    }
  });

  it("draws changing overlays over a retained hard-shadow world without restarting samples", () => {
    const host = createProgressiveHost();
    const overlay = addOverlay(host);
    const renderer = host.layer.getRenderer()!;
    mono.renderRound.mockImplementation((_renderer, _width, _height, draw) => {
      draw();
      mono.converged = true;
      mono.hasSettledFrame = true;
    });
    host.controller.retainSettledFrame = () => true;
    try {
      host.render();
      host.controller.active = () => false;
      vi.clearAllMocks();
      overlay.change();
      host.render();
      overlay.change();
      host.render();
      expect(mono.renderRound).not.toHaveBeenCalled();
      expect(mono.composite).toHaveBeenCalledTimes(2);
      expect(renderer.render).toHaveBeenCalledTimes(2);
      expect(
        vi
          .mocked(renderer.render)
          .mock.calls.every(([object]) => object === overlay.root)
      ).toBe(true);
    } finally {
      host.layer.dispose();
    }
  });

  it("draws measurement overlays after the ordinary world with shadows off", () => {
    const host = createProgressiveHost();
    const overlay = addOverlay(host);
    const renderer = host.layer.getRenderer()!;
    host.layer.setAccumulationController(null);
    const visibility: boolean[] = [];
    vi.mocked(renderer.render).mockImplementation((object) => {
      visibility.push(overlay.root.visible);
      if (object === overlay.root)
        expect(renderer.shadowMap.enabled).toBe(false);
    });
    try {
      host.render();
      overlay.change();
      host.render();
      expect(visibility).toEqual([false, true, false, true]);
      expect(mono.renderRound).not.toHaveBeenCalled();
      expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
      expect(renderer.shadowMap.enabled).toBe(true);
    } finally {
      host.layer.dispose();
    }
  });

  it.each(["world", "overlay"])(
    "restores visibility and renderer state when the %s pass throws",
    (pass) => {
      const host = createProgressiveHost();
      const overlay = addOverlay(host);
      const renderer = host.layer.getRenderer()!;
      host.layer.setAccumulationController(null);
      renderer.toneMapping = THREE.AgXToneMapping;
      vi.mocked(renderer.render).mockImplementation((object) => {
        if ((object === overlay.root) === (pass === "overlay"))
          throw new Error("failed " + pass);
      });
      try {
        expect(() => host.render()).toThrow("failed " + pass);
        expect(overlay.root.visible).toBe(true);
        expect(renderer.toneMapping).toBe(THREE.AgXToneMapping);
        expect(renderer.shadowMap.enabled).toBe(true);
        expect(host.gl.depthRange).toHaveBeenLastCalledWith(0, 0.985);
      } finally {
        host.layer.dispose();
      }
    }
  );

  it("preserves a deliberately hidden overlay root", () => {
    const host = createProgressiveHost();
    const overlay = addOverlay(host, false);
    const renderer = host.layer.getRenderer()!;
    host.layer.setAccumulationController(null);
    try {
      host.render();
      expect(overlay.root.visible).toBe(false);
      expect(renderer.render).toHaveBeenCalledOnce();
      expect(renderer.render).not.toHaveBeenCalledWith(
        overlay.root,
        expect.anything()
      );
    } finally {
      host.layer.dispose();
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
