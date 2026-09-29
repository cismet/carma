import {
  createProgressiveHost,
  expectMatrixToBeCloseTo,
} from "./shared-three-scene-layer.test-support";
import * as THREE from "three";
import { MAPLIBRE_EARTH_RADIUS } from "@carma-geo/proj";
import { degToRadNumeric } from "@carma-units";
import { describe, expect, it, vi } from "vitest";
import { buildSharedThreeSceneLayer } from "./shared-three-scene-layer";
import { TILE_CAMERA_ROLE } from "../../core/tile-camera-demand";
import {
  configureSharedRenderCamera,
  syncSharedCanvasViewport,
} from "./shared-three-scene-render-context";

describe("shared three scene layer", () => {
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
        .scale(new THREE.Vector3().setScalar(1 / MAPLIBRE_EARTH_RADIUS));
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

  it("keeps CSS LOD dimensions independent of native DPR and updates layout-only resizes", () => {
    const renderer = { setViewport: vi.fn() };
    const canvas = {
      width: 800,
      height: 600,
      clientWidth: 800,
      clientHeight: 600,
    };
    const physical = new THREE.Vector2();
    const css = new THREE.Vector2();
    for (const dpr of [1, 1.25, 2, 3]) {
      canvas.width = 800 * dpr;
      canvas.height = 600 * dpr;
      syncSharedCanvasViewport(renderer, canvas, physical, css);
      expect(css.toArray()).toEqual([800, 600]);
      expect(physical.toArray()).toEqual([800 * dpr, 600 * dpr]);
      expect(renderer.setViewport).toHaveBeenLastCalledWith(
        0,
        0,
        800 * dpr,
        600 * dpr
      );
    }
    renderer.setViewport.mockClear();
    canvas.clientWidth = 1200;
    canvas.clientHeight = 900;
    syncSharedCanvasViewport(renderer, canvas, physical, css);
    expect(css.toArray()).toEqual([1200, 900]);
    expect(renderer.setViewport).not.toHaveBeenCalled();
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
describe("shared three scene layer", () => {
  it("moves the frame only once keeping it would show half a pixel of error", () => {
    const { layer, map, render } = createProgressiveHost();
    layer.setAccumulationController(null);
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
    layer.setAccumulationController(null);
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
