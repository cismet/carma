import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSharedSceneAccumulator } from "@carma-mapping/engines/three/primitives/rendering";
import { getMapLoadingProgress } from "./map-loading-progress";

import { buildSharedThreeSceneLayer } from "./shared-three-scene-layer";
import {
  clearDepthForMapStyleOverlays,
  clearMapStyleGroundBeforeThreeTerrain,
  configureSharedRenderCamera,
  installRenderTargetDepthRangeBridge,
  syncSharedCanvasViewport,
} from "./shared-three-scene-render-context";
import { configureMapStyleProjectedMaterial } from "./shared-three-map-style-material";
import { type SharedSceneAccumulationController } from "../../core/shared-three-scene-types";

vi.mock("@carma-mapping/engines/threejs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@carma-mapping/engines/threejs")>()),
  synthesizeLodCamera: vi.fn(() => true),
}));

vi.mock(
  "@carma-mapping/engines/three/primitives/rendering",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@carma-mapping/engines/three/primitives/rendering")
    >()),
    buildSharedSceneAccumulator: vi.fn(),
  })
);

vi.mock("three", async (importOriginal) => ({
  ...(await importOriginal<typeof import("three")>()),
  WebGLRenderer: class {
    shadowMap = {};
    setRenderTarget = vi.fn();
    setViewport = vi.fn();
    resetState = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
  },
}));

const createProgressiveHost = () => {
  const canvas = {
    width: 4400,
    height: 1800,
    clientWidth: 2200,
    clientHeight: 900,
  };
  const map = {
    getCanvas: () => canvas,
    getCenter: () => ({ lng: 7.15, lat: 51.25 }),
    getTerrain: () => null,
    on: vi.fn(),
    off: vi.fn(),
    triggerRepaint: vi.fn(),
  };
  const hostFramebuffer = {};
  const gl = {
    DEPTH_RANGE: 0x0b70,
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_BINDING: 0x8ca6,
    DEPTH_BUFFER_BIT: 0x00000100,
    getParameter: vi.fn((parameter: number) =>
      parameter === 0x0b70 ? [0, 0.985] : hostFramebuffer
    ),
    bindFramebuffer: vi.fn(),
    depthRange: vi.fn(),
    depthMask: vi.fn(),
    clearDepth: vi.fn(),
    clear: vi.fn(),
  };
  const layer = buildSharedThreeSceneLayer("progressive-host");
  layer.onAdd!(map as never, gl as never);
  const controller: SharedSceneAccumulationController = {
    active: vi.fn(() => true),
    epoch: () => 0,
    visualEpoch: () => 0,
    retainSettledFrame: () => false,
    prepareRound: vi.fn(),
    finishRound: vi.fn(),
    onSettled: vi.fn(),
    rounds: 8,
  };
  layer.setAccumulationController(controller);
  const render = () =>
    layer.render(
      gl as never,
      {
        defaultProjectionData: { mainMatrix: new THREE.Matrix4().elements },
      } as never
    );
  return { layer, controller, map, canvas, gl, hostFramebuffer, render };
};

const expectMatrixToBeCloseTo = (
  actual: THREE.Matrix4,
  expected: THREE.Matrix4
): void => {
  actual.elements.forEach((value, index) => {
    expect(value).toBeCloseTo(expected.elements[index], 10);
  });
};

describe("shared Three.js scene layer", () => {
  it("projects the captured MapLibre ground pass before terrain lighting", () => {
    const material = new THREE.MeshLambertMaterial();
    const texture = new THREE.Texture();
    const sceneToClip = new THREE.Matrix4().makeTranslation(1, 2, 3);
    const uniforms = {
      texture: { value: texture },
      sceneToClip: { value: sceneToClip },
      enabled: { value: 1 },
      depthTexture: { value: null },
      depthEnabled: { value: 0 },
      depthNearFar: { value: new THREE.Vector2(1, 1000) },
      texelSize: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    };
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
    };

    configureMapStyleProjectedMaterial(material, uniforms);
    material.onBeforeCompile(shader as never, {} as never);

    expect(shader.uniforms).toMatchObject({
      carmaMapStyleTexture: uniforms.texture,
      carmaMapStyleSceneToClip: uniforms.sceneToClip,
      carmaMapStyleEnabled: uniforms.enabled,
      carmaMapStyleTexelSize: uniforms.texelSize,
    });
    expect(shader.vertexShader).toContain(
      "carmaMapStyleSceneToClip * modelMatrix"
    );
    expect(shader.fragmentShader).toContain(
      "diffuseColor.rgb = carmaMapStyleSRGBToLinear"
    );
    expect(shader.fragmentShader).toContain("diffuseColor.a = 1.0");
    const terrainDepthBranch = shader.fragmentShader
      .split("#ifndef CARMA_MAP_STYLE_OVERLAY")[1]
      .split("#else")[0];
    expect(terrainDepthBranch).toContain("return true;");
    expect(terrainDepthBranch).not.toContain("fragmentDistance");
    expect(material.customProgramCacheKey()).toContain(
      "carma-map-style-projection-v5"
    );
    expect(material.defines?.CARMA_MAP_STYLE_OVERLAY).toBeUndefined();
  });

  it("composites the captured pass over a textured receiver in overlay mode", () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = {
      texture: { value: new THREE.Texture() },
      sceneToClip: { value: new THREE.Matrix4() },
      enabled: { value: 1 },
      depthTexture: { value: new THREE.Texture() },
      depthEnabled: { value: 1 },
      depthNearFar: { value: new THREE.Vector2(1, 1000) },
      texelSize: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    };
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
    };

    configureMapStyleProjectedMaterial(material, uniforms, "overlay");
    material.onBeforeCompile(shader as never, {} as never);

    expect(material.defines?.CARMA_MAP_STYLE_OVERLAY).toBe("");
    expect(shader.fragmentShader).toContain("#ifdef CARMA_MAP_STYLE_OVERLAY");
    expect(shader.fragmentShader).toContain("carmaMapStyleOccludedByMesh");
    expect(shader.fragmentShader).toContain("carmaMapStyleLabelCoverage");
    expect(shader.fragmentShader.indexOf("carmaShade")).toBeLessThan(
      shader.fragmentShader.indexOf("#include <opaque_fragment>")
    );
    expect(shader.uniforms).toMatchObject({
      carmaMapStyleDepthTexture: uniforms.depthTexture,
      carmaMapStyleDepthEnabled: uniforms.depthEnabled,
      carmaMapStyleDepthNearFar: uniforms.depthNearFar,
    });
    expect(shader.fragmentShader).toContain("carmaMapStyleSample.a");
    expect(shader.fragmentShader).toContain("carmaMapStyleSampleGround");
    expect(shader.fragmentShader).toContain("carmaMapStyleMatchesReceiver");
    expect(material.customProgramCacheKey()).toContain("|overlay");

    configureMapStyleProjectedMaterial(material, uniforms, "replace");
    expect(material.defines?.CARMA_MAP_STYLE_OVERLAY).toBeUndefined();
    expect(material.customProgramCacheKey()).toContain("|replace");
  });

  it("clears mesh depth before MapLibre draws retained place labels", () => {
    const gl = {
      DEPTH_BUFFER_BIT: 0x00000100,
      clear: vi.fn(),
      clearDepth: vi.fn(),
      depthMask: vi.fn(),
      depthRange: vi.fn(),
    };

    clearDepthForMapStyleOverlays(gl, [0, 0.985]);

    expect(gl.depthMask).toHaveBeenCalledWith(true);
    expect(gl.depthRange.mock.calls).toEqual([
      [0, 1],
      [0, 0.985],
    ]);
    expect(gl.clearDepth).toHaveBeenCalledWith(1);
    expect(gl.clear).toHaveBeenCalledWith(gl.DEPTH_BUFFER_BIT);
  });

  it("clears MapLibre ground color and depth before Three replaces it", () => {
    const previousClearColor = new Float32Array([0.2, 0.3, 0.4, 1]);
    const gl = {
      COLOR_BUFFER_BIT: 0x00004000,
      DEPTH_BUFFER_BIT: 0x00000100,
      COLOR_CLEAR_VALUE: 0x0c22,
      clear: vi.fn(),
      clearColor: vi.fn(),
      clearDepth: vi.fn(),
      depthMask: vi.fn(),
      depthRange: vi.fn(),
      getParameter: vi.fn(() => previousClearColor),
    };

    clearMapStyleGroundBeforeThreeTerrain(gl, [0, 0.985]);

    expect(gl.clear).toHaveBeenCalledWith(
      gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT
    );
    expect(gl.clearColor.mock.calls).toEqual([
      [0, 0, 0, 0],
      [...previousClearColor],
    ]);
    expect(gl.depthRange.mock.calls).toEqual([
      [0, 1],
      [0, 0.985],
    ]);
  });

  it("uses a real camera view without changing MapLibre's scene-to-clip matrix", () => {
    const lodCamera = new THREE.PerspectiveCamera(52, 16 / 9, 2, 1_000_000);
    lodCamera.position.set(1_250, 840, -430);
    lodCamera.up.set(0, 1, 0);
    lodCamera.lookAt(new THREE.Vector3(140, 210, 380));
    lodCamera.updateMatrixWorld(true);

    const sceneToClipMatrix = new THREE.Matrix4()
      .makePerspective(-0.7, 0.9, 0.6, -0.5, 0.5, 2_000)
      .multiply(new THREE.Matrix4().makeTranslation(0.15, -0.25, 0.4));
    const renderCamera = new THREE.PerspectiveCamera();

    configureSharedRenderCamera(renderCamera, lodCamera, sceneToClipMatrix);

    expectMatrixToBeCloseTo(renderCamera.matrixWorld, lodCamera.matrixWorld);
    expectMatrixToBeCloseTo(
      renderCamera.matrixWorldInverse,
      lodCamera.matrixWorldInverse
    );
    expectMatrixToBeCloseTo(
      new THREE.Matrix4().multiplyMatrices(
        renderCamera.projectionMatrix,
        renderCamera.matrixWorldInverse
      ),
      sceneToClipMatrix
    );

    renderCamera.updateMatrixWorld(true);
    expectMatrixToBeCloseTo(
      new THREE.Matrix4().multiplyMatrices(
        renderCamera.projectionMatrix,
        renderCamera.matrixWorldInverse
      ),
      sceneToClipMatrix
    );
  });

  it("tracks MapLibre canvas resizes in Three's main framebuffer viewport", () => {
    const renderer = {
      setViewport: vi.fn(),
    } as unknown as Pick<THREE.WebGLRenderer, "setViewport">;
    const canvas = { width: 1_280, height: 720 };
    const viewport = new THREE.Vector2(1, 1);

    syncSharedCanvasViewport(renderer, canvas, viewport);

    expect(viewport.toArray()).toEqual([1_280, 720]);
    expect(renderer.setViewport).toHaveBeenLastCalledWith(0, 0, 1_280, 720);

    canvas.width = 1_400;
    canvas.height = 500;
    syncSharedCanvasViewport(renderer, canvas, viewport);

    expect(viewport.toArray()).toEqual([1_400, 500]);
    expect(renderer.setViewport).toHaveBeenLastCalledWith(0, 0, 1_400, 500);

    syncSharedCanvasViewport(renderer, canvas, viewport);
    expect(renderer.setViewport).toHaveBeenCalledTimes(2);
  });

  it("uses physical HiDPI pixels above 4096 without resizing the MapLibre canvas", () => {
    const renderer = {
      setViewport: vi.fn(),
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
    };
    const canvas = {
      width: 4400,
      height: 1800,
      clientWidth: 2200,
      clientHeight: 900,
    };
    const viewport = new THREE.Vector2(2400, 1800);
    syncSharedCanvasViewport(renderer, canvas, viewport);
    expect(viewport.toArray()).toEqual([4400, 1800]);
    expect(renderer.setViewport).toHaveBeenLastCalledWith(0, 0, 4400, 1800);
    expect(renderer.setSize).not.toHaveBeenCalled();
    expect(renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(canvas.width).toBe(4400);
  });

  it("uses canonical depth for offscreen targets and MapLibre depth on main", () => {
    const events: string[] = [];
    const hostFramebuffer = {} as WebGLFramebuffer;
    let activeFramebuffer: WebGLFramebuffer | null = hostFramebuffer;
    const originalSetRenderTarget = vi.fn((target: unknown) => {
      events.push(target === null ? "target:main" : "target:offscreen");
      activeFramebuffer = target === null ? null : (target as WebGLFramebuffer);
    });
    const renderer = {
      setRenderTarget: originalSetRenderTarget,
    } as unknown as Pick<THREE.WebGLRenderer, "setRenderTarget">;
    const gl = {
      FRAMEBUFFER: 0x8d40,
      FRAMEBUFFER_BINDING: 0x8ca6,
      getParameter: vi.fn(() => activeFramebuffer),
      bindFramebuffer: vi.fn(
        (_target: number, framebuffer: WebGLFramebuffer | null) => {
          activeFramebuffer = framebuffer;
          events.push(
            framebuffer === hostFramebuffer
              ? "framebuffer:host"
              : "framebuffer:other"
          );
        }
      ),
      depthRange: vi.fn((near: number, far: number) => {
        events.push(`depth:${near}:${far}`);
      }),
    };
    const bridge = installRenderTargetDepthRangeBridge(renderer, gl);

    bridge.render([0, 0.985], () => {
      renderer.setRenderTarget({} as THREE.WebGLRenderTarget);
      renderer.setRenderTarget(null);
      expect(activeFramebuffer).toBe(hostFramebuffer);
    });

    expect(events).toEqual([
      "target:offscreen",
      "depth:0:1",
      "target:main",
      "framebuffer:host",
      "depth:0:0.985",
      "framebuffer:host",
      "depth:0:0.985",
    ]);
    expect(activeFramebuffer).toBe(hostFramebuffer);

    bridge.dispose();
    renderer.setRenderTarget(null);
    expect(originalSetRenderTarget).toHaveBeenCalledTimes(3);
    expect(gl.depthRange).toHaveBeenCalledTimes(3);
  });

  it("restores nested host targets through Three's cache even when capture throws", () => {
    const host = {} as WebGLFramebuffer;
    const outerTarget = {} as THREE.WebGLRenderTarget;
    const innerTarget = {} as THREE.WebGLRenderTarget;
    let bound: unknown = host;
    let cached: unknown = null;
    const gl = {
      FRAMEBUFFER: 0x8d40,
      FRAMEBUFFER_BINDING: 0x8ca6,
      getParameter: vi.fn(() => bound),
      bindFramebuffer: vi.fn((_target: number, framebuffer: unknown) => {
        bound = framebuffer;
      }),
      depthRange: vi.fn(),
    };
    const state = {
      bindFramebuffer: vi.fn(
        (target: number, framebuffer: WebGLFramebuffer | null) => {
          if (cached === framebuffer) return;
          gl.bindFramebuffer(target, framebuffer);
          cached = framebuffer;
        }
      ),
    };
    const original = vi.fn((target: THREE.WebGLRenderTarget | null) => {
      state.bindFramebuffer(
        gl.FRAMEBUFFER,
        target as unknown as WebGLFramebuffer | null
      );
    });
    const renderer = { setRenderTarget: original, state };
    const bridge = installRenderTargetDepthRangeBridge(renderer, gl);
    const failure = new Error("capture failed");

    expect(() =>
      bridge.render([0, 0.985], () => {
        renderer.setRenderTarget(outerTarget);
        expect(() =>
          bridge.render([0, 1], () => {
            renderer.setRenderTarget(innerTarget);
            renderer.setRenderTarget(null);
            expect(bound).toBe(outerTarget);
            expect(cached).toBe(outerTarget);
            expect(gl.depthRange).toHaveBeenLastCalledWith(0, 1);
            throw failure;
          })
        ).toThrow(failure);
        expect(bound).toBe(outerTarget);
        renderer.setRenderTarget(null);
        expect(bound).toBe(host);
        expect(cached).toBe(host);
        expect(gl.depthRange).toHaveBeenLastCalledWith(0, 0.985);
        renderer.setRenderTarget(innerTarget);
        throw failure;
      })
    ).toThrow(failure);

    expect(bound).toBe(host);
    expect(cached).toBe(host);
    expect(gl.depthRange).toHaveBeenLastCalledWith(0, 0.985);
    const depthCalls = gl.depthRange.mock.calls.length;
    renderer.setRenderTarget(null);
    expect(bound).toBeNull();
    expect(gl.depthRange).toHaveBeenCalledTimes(depthCalls);
    bridge.dispose();
    expect(renderer.setRenderTarget).toBe(original);
  });

  it("exposes attached runtime roots", () => {
    const layer = buildSharedThreeSceneLayer("shared-three-scene");
    const root = new THREE.Group();
    const dispose = vi.fn();

    layer.addRuntime({
      id: "mesh-runtime",
      originLngLat: [7.15, 51.25],
      root,
      update: vi.fn(),
      dispose,
    });

    expect(layer.getScene().children).toContain(root);
    expect(layer.getRuntimes()).toEqual([
      expect.objectContaining({ id: "mesh-runtime" }),
    ]);
    expect(layer.hasRuntime("mesh-runtime")).toBe(true);

    layer.removeRuntime("mesh-runtime");

    expect(layer.getScene().children).not.toContain(root);
    expect(layer.getRuntimes()).toEqual([]);
    expect(dispose).toHaveBeenCalledOnce();
  });
});

describe("progressive strategy host", () => {
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
