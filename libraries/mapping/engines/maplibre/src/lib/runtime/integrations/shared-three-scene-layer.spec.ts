import * as THREE from "three";
import { degToRadNumeric } from "@carma-units";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSharedSceneAccumulator } from "@carma-mapping/engines/three/primitives/rendering";
import { synthesizeLodCamera } from "@carma-mapping/engines/threejs";
import { getMapLoadingProgress } from "./map-loading-progress";

import { buildSharedThreeSceneLayer } from "./shared-three-scene-layer";
import { TILE_CAMERA_ROLE } from "../../core/tile-camera-demand";
import {
  clearDepthForMapStyleOverlays,
  clearMapStyleGroundBeforeThreeTerrain,
  configureSharedRenderCamera,
  installRenderTargetDepthRangeBridge,
  syncSharedCanvasViewport,
} from "./shared-three-scene-render-context";
import { configureMapStyleProjectedMaterial } from "./shared-three-map-style-material";
import {
  type SharedSceneAccumulationController,
  type SharedThreeSceneRuntime,
} from "../../core/shared-three-scene-types";

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
    getBoundingClientRect: () => ({ left: 30, top: 50 }),
  };
  const map = {
    getCanvas: () => canvas,
    getCenter: () => ({ lng: 7.15, lat: 51.25 }),
    project: vi.fn(() => ({ x: 1100, y: 450 })),
    getTerrain: () => null,
    isZooming: vi.fn(() => false),
    unproject: vi.fn(() => ({ lng: 7.15, lat: 51.25 })),
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
    onPresented: vi.fn(),
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
  it.each([false, true, undefined])(
    "preserves DEM under building-only style receivers (%s)",
    (providesTerrain) => {
      const host = createProgressiveHost();
      const clearColor = vi.fn();
      Object.assign(host.gl, {
        COLOR_BUFFER_BIT: 0x4000,
        COLOR_CLEAR_VALUE: 0x0c22,
        clearColor,
      });
      host.gl.getParameter.mockImplementation((parameter) =>
        parameter === 0x0b70
          ? [0, 0.985]
          : parameter === 0x0c22
          ? [0, 0, 0, 0]
          : host.hostFramebuffer
      );
      host.layer.setAccumulationController(null);
      // Isolate ground ownership; capture/material rendering has separate tests.
      host.layer.setMapStyleProjectionVisible(false);
      host.layer.addRuntime({
        id: "style-ground",
        originLngLat: [7.15, 51.25],
        root: new THREE.Group(),
        providesTerrain,
        receivesMapStyleTexture: true,
        update: vi.fn(),
        dispose: vi.fn(),
      });
      try {
        host.render();
        expect(clearColor).toHaveBeenCalledTimes(
          providesTerrain === false ? 0 : 2
        );
      } finally {
        host.layer.onRemove!(host.map as never, host.gl as never);
      }
    }
  );
  it("pauses drawing and updates without dropping resident runtimes", () => {
    const host = createProgressiveHost();
    host.layer.setAccumulationController(null);
    const update = vi.fn();
    const dispose = vi.fn();
    const root = new THREE.Group();
    host.layer.addRuntime({
      id: "pause-probe",
      originLngLat: [7.15, 51.25],
      root,
      update,
      dispose,
    });
    try {
      host.render();
      const count = update.mock.calls.length;
      const renderer = host.layer.getRenderer()!;
      const draws = vi.mocked(renderer.render).mock.calls.length;
      host.layer.setRenderingPaused(true);
      host.render();
      expect(host.layer.isRenderingPaused()).toBe(true);
      expect(update).toHaveBeenCalledTimes(count);
      expect(renderer.render).toHaveBeenCalledTimes(draws);
      expect(root.parent).not.toBeNull();
      expect(dispose).not.toHaveBeenCalled();
      host.layer.setRenderingPaused(false);
      host.render();
      expect(update).toHaveBeenCalledTimes(count + 1);
    } finally {
      host.layer.onRemove!(host.map as never, host.gl as never);
    }
  });
  it("mounts the same local scene on the globe without replacing its root", () => {
    const host = createProgressiveHost();
    host.layer.setAccumulationController(null);
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(10, 20, 30);
    const texture = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1
    );
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    root.add(mesh);
    const positions = geometry.getAttribute("position");
    const originalPositions = Array.from(positions.array);
    const originalUvs = Array.from(geometry.getAttribute("uv").array);
    const textureVersion = texture.version;
    const update = vi.fn();
    host.layer.addRuntime({
      id: "globe-probe",
      originLngLat: [7.15, 51.25],
      root,
      update,
      dispose: vi.fn(),
    });
    try {
      host.layer.render(
        host.gl as never,
        {
          defaultProjectionData: {
            mainMatrix: new THREE.Matrix4().elements,
            projectionTransition: 1,
          },
        } as never
      );
      const camera = update.mock.calls.at(-1)![0].renderCamera;
      const actual = camera.projectionMatrix
        .clone()
        .multiply(camera.matrixWorldInverse);
      const expected = new THREE.Matrix4()
        .makeRotationY(degToRadNumeric(7.15))
        .multiply(new THREE.Matrix4().makeRotationX(degToRadNumeric(-51.25)))
        .multiply(new THREE.Matrix4().makeTranslation(0, 0, 1))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        .scale(new THREE.Vector3().setScalar(1 / 6371008.8));
      expectMatrixToBeCloseTo(actual, expected);
      expect(actual.elements.every(Number.isFinite)).toBe(true);
      const parent = root.parent;
      const rootMatrix = root.matrix.clone();
      host.render();
      host.layer.render(
        host.gl as never,
        {
          defaultProjectionData: {
            mainMatrix: new THREE.Matrix4().makeTranslation(0.1, -0.2, 0)
              .elements,
            projectionTransition: 1,
          },
        } as never
      );
      expect(root.parent).toBe(parent);
      expect(root.scale.toArray()).toEqual([1, 1, 1]);
      expect(root.matrix.equals(rootMatrix)).toBe(true);
      expect(host.layer.getRuntimes()).toHaveLength(1);
      expect(mesh.geometry).toBe(geometry);
      expect(geometry.getAttribute("position")).toBe(positions);
      expect(Array.from(positions.array)).toEqual(originalPositions);
      expect(Array.from(geometry.getAttribute("uv").array)).toEqual(
        originalUvs
      );
      expect(mesh.material).toBe(material);
      expect(material.map).toBe(texture);
      expect(texture.version).toBe(textureVersion);
    } finally {
      host.layer.onRemove!(host.map as never, host.gl as never);
      geometry.dispose();
      material.dispose();
      texture.dispose();
    }
  });
  it("routes future frustums without changing visible demand or the live camera", () => {
    const host = createProgressiveHost();
    host.layer.setAccumulationController(null);
    const update = vi.fn(),
      setPrefetchCameraView = vi.fn();
    host.layer.addRuntime({
      id: "predicted",
      originLngLat: [7.15, 51.25],
      root: new THREE.Group(),
      update,
      dispose: vi.fn(),
      setPrefetchCameraView,
    });
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 100);
    const sample = vi.fn((aheadMs: number) => {
      const future = camera.clone();
      future.position.x = aheadMs / 100;
      return {
        id: "flight",
        camera: future,
        viewport: [400, 400] as const,
        errorTargetPixels: 4,
        role: TILE_CAMERA_ROLE.RECEIVER,
      };
    });
    try {
      expect(host.layer.requestTileCameraAhead(sample, 500)).toBe("flight");
      expect(sample).toHaveBeenCalledWith(500);
      expect(setPrefetchCameraView.mock.calls[0][0].matrixWorld[12]).toBe(5);
      expect(camera.position.x).toBe(0);
      host.render();
      expect(update.mock.calls.at(-1)![0].tileCameraViews).toHaveLength(0);
      host.layer.removePrefetchCameraView("flight");
      expect(setPrefetchCameraView).toHaveBeenLastCalledWith(null, "flight");
      expect(() => host.layer.requestTileCameraAhead(sample, -1)).toThrow();
    } finally {
      host.layer.dispose();
    }
  });

  it("shares one camera snapshot and renderer across runtimes without replacing their roots", () => {
    const host = createProgressiveHost();
    host.layer.setAccumulationController(null);
    const updates = [vi.fn(), vi.fn()];
    const roots = [new THREE.Group(), new THREE.Group()];
    roots.forEach((root, index) =>
      host.layer.addRuntime({
        id: `source-${index}`,
        originLngLat: [7.15, 51.25],
        root,
        update: updates[index],
        dispose: vi.fn(),
      })
    );
    const renderer = host.layer.getRenderer();
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 100);
    const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 100);
    const view = {
      id: "inspection",
      camera,
      viewport: [400, 400] as const,
      errorTargetPixels: 2,
      role: TILE_CAMERA_ROLE.RECEIVER,
    };
    try {
      host.layer.setTileCameraView(view);
      host.layer.setTileCameraView({
        ...view,
        id: "rays",
        camera: ortho,
        role: TILE_CAMERA_ROLE.GEOMETRY,
      });
      host.render();
      const firstFrame = updates[0].mock.calls.at(-1)![0];
      expect(updates[1].mock.calls.at(-1)![0].tileCameraViews).toBe(
        firstFrame.tileCameraViews
      );
      expect(firstFrame.tileCameraViews).toHaveLength(2);
      camera.position.x = 20;
      host.layer.removeTileCameraView("rays");
      host.render();
      const nextFrame = updates[0].mock.calls.at(-1)![0];
      expect(nextFrame.tileCameraViews).toHaveLength(1);
      expect(nextFrame.tileCameraViews[0].matrixWorld[12]).toBe(20);
      expect(firstFrame.tileCameraViews[0].matrixWorld[12]).toBe(0);
      expect(host.layer.getRenderer()).toBe(renderer);
      roots.forEach((root) => expect(root.parent).toBe(host.layer.getScene()));
    } finally {
      host.layer.dispose();
    }
  });

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
    host.render();
    vi.clearAllMocks();
    host.controller.active = () => false;
    host.controller.visualEpoch = () => 1;
    host.render();
    host.render();
    expect(mono.dispose).toHaveBeenCalledOnce();
    expect(buildSharedSceneAccumulator).not.toHaveBeenCalled();
    expect(mono.composite).not.toHaveBeenCalled();
    host.controller.active = () => true;
    host.render();
    expect(buildSharedSceneAccumulator).toHaveBeenCalledOnce();
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

describe("shared scene local frame", () => {
  it("moves the frame only once keeping it would show half a pixel of error", () => {
    const { layer, map, render } = createProgressiveHost();
    const initial = layer.getLocalFrame();
    expect(initial?.revision).toBe(1);
    expect(initial?.lngLat).toEqual([7.15, 51.25]);

    // About 130 m away: far inside the budget at the default zoom.
    map.getCenter = () => ({ lng: 7.151, lat: 51.251 });
    render();
    expect(layer.getLocalFrame()).toBe(initial);

    // About 5.6 km north: the Mercator scale drift alone exceeds the budget.
    map.getCenter = () => ({ lng: 7.15, lat: 51.3 });
    render();
    const moved = layer.getLocalFrame()!;
    expect(moved.revision).toBe(2);
    expect(moved.lngLat).toEqual([7.15, 51.3]);
    expectMatrixToBeCloseTo(
      moved.sceneFromLocalRotation,
      new THREE.Matrix4().extractRotation(moved.sceneFromLocal)
    );
    expect(moved.sceneFromLocalRotation.determinant()).toBeCloseTo(1, 10);
    expect(
      moved.sceneFromLocalRotation.equals(initial!.sceneFromLocalRotation)
    ).toBe(false);

    // Staying put keeps the moved frame.
    render();
    expect(layer.getLocalFrame()).toBe(moved);
  });

  it("carries frame-mounted runtimes in a group that moves with the frame", () => {
    const { layer, map, render } = createProgressiveHost();
    const group = layer.getLocalFrameGroup();
    const runtime = (id: string, mountsOnLocalFrame?: boolean) => ({
      id,
      originLngLat: [7.15, 51.25] as [number, number],
      root: new THREE.Group(),
      mountsOnLocalFrame,
      update: vi.fn(),
      dispose: vi.fn(),
    });
    const mounted = runtime("mounted", true);
    const plain = runtime("plain");
    layer.addRuntime(mounted);
    layer.addRuntime(plain);
    expect(mounted.root.parent).toBe(group);
    expect(plain.root.parent).toBe(layer.getScene());
    const initial = layer.getLocalFrame()!;
    const identity = new THREE.Matrix4();
    expect(initial.referenceToCurrent.equals(identity)).toBe(true);
    expect(group.matrix.equals(identity)).toBe(true);

    map.getCenter = () => ({ lng: 7.15, lat: 51.3 });
    render();
    const moved = layer.getLocalFrame()!;
    expect(moved.referenceLngLat).toEqual(initial.lngLat);
    expectMatrixToBeCloseTo(
      moved.referenceToCurrent,
      moved.sceneFromLocal
        .clone()
        .multiply(initial.sceneFromLocal.clone().invert())
    );
    expectMatrixToBeCloseTo(group.matrix, moved.referenceToCurrent);
    expectMatrixToBeCloseTo(
      moved.currentToReference.clone().multiply(moved.referenceToCurrent),
      identity
    );
    expect(mounted.root.parent).toBe(group);
    layer.removeRuntime("mounted");
    expect(mounted.root.parent).toBeNull();
  });
});
