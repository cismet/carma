import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  buildSharedThreeSceneLayer,
  clearDepthForMapStyleOverlays,
  clearMapStyleGroundBeforeThreeTerrain,
  configureMapStyleProjectedMaterial,
  configureSharedRenderCamera,
  installRenderTargetDepthRangeBridge,
  syncSharedCanvasViewport,
} from "./shared-three-scene-layer";

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
    };
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader: "#include <common>\n#include <map_fragment>",
    };

    configureMapStyleProjectedMaterial(material, uniforms);
    material.onBeforeCompile(shader as never, {} as never);

    expect(shader.uniforms).toMatchObject({
      carmaMapStyleTexture: uniforms.texture,
      carmaMapStyleSceneToClip: uniforms.sceneToClip,
      carmaMapStyleEnabled: uniforms.enabled,
    });
    expect(shader.vertexShader).toContain(
      "carmaMapStyleSceneToClip * modelMatrix"
    );
    expect(shader.fragmentShader).toContain(
      "diffuseColor.rgb = carmaMapStyleSRGBToLinear"
    );
    expect(shader.fragmentShader).toContain("diffuseColor.a = 1.0");
    expect(material.customProgramCacheKey()).toContain(
      "carma-map-style-projection-v1"
    );
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
    });

    expect(events).toEqual([
      "target:offscreen",
      "depth:0:1",
      "target:main",
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
