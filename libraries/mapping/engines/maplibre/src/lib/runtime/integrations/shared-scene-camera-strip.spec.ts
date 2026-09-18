import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSpineCameraRig,
  type CameraRigView,
} from "../../core/multi-camera-rig";
import type { SharedThreeSceneLayer } from "../../core/shared-three-scene-types";
import {
  TILE_CAMERA_PRIORITY,
  TILE_CAMERA_ROLE,
} from "../../core/tile-camera-demand";
import { createSharedSceneCameraStrip } from "./shared-scene-camera-strip";

const previewMocks = vi.hoisted(() => ({
  instances: [] as Array<{
    render: ReturnType<typeof vi.fn>;
    renderAsync: ReturnType<typeof vi.fn>;
    renderViewport: ReturnType<typeof vi.fn>;
    renderTexture: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
  jobs: [] as Array<{
    callback: (pixels: Uint8Array, width: number, height: number) => void;
    width: number;
    height: number;
    clippingPlanes: readonly THREE.Plane[];
    resolve: (rendered: boolean) => void;
  }>,
}));

vi.mock("./shared-three-scene-camera-preview", () => ({
  createSharedThreeSceneCameraPreview: () => {
    const preview = {
      render: vi.fn(),
      renderViewport: vi.fn(() => true),
      renderTexture: vi.fn(() => new THREE.Texture()),
      renderAsync: vi.fn(
        (
          _camera: THREE.Camera,
          width: number,
          height: number,
          callback: (pixels: Uint8Array, width: number, height: number) => void,
          clippingPlanes: readonly THREE.Plane[]
        ) =>
          new Promise<boolean>((resolve) => {
            previewMocks.jobs.push({
              callback,
              width,
              height,
              clippingPlanes,
              resolve,
            });
          })
      ),
      dispose: vi.fn(),
    };
    previewMocks.instances.push(preview);
    return preview;
  },
}));

const flush = async () => {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
};

const createLayer = () => {
  const scene = new THREE.Scene();
  const passes = new Set<() => void>();
  const views = new Map<
    string,
    Parameters<SharedThreeSceneLayer["setTileCameraView"]>[0]
  >();
  const layer = {
    projectSceneToLngLat: vi.fn((position: THREE.Vector3) => [
      position.x,
      position.z,
    ]),
    getScene: vi.fn(() => scene),
    getRenderer: () => null,
    addScreenRenderPass: (draw: () => void) => {
      passes.add(draw);
      return () => passes.delete(draw);
    },
    requestScreenRender: vi.fn(),
    setTileCameraView: vi.fn((view) => views.set(view.id, view)),
    removeTileCameraView: vi.fn((id) => views.delete(id)),
    runIdleRender: vi.fn((render: () => void) => {
      render();
      return true;
    }),
  } as unknown as SharedThreeSceneLayer;
  return { layer, scene, views, passes };
};

const createViews = () =>
  createSpineCameraRig({
    points: [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(2, 0, 8),
    ],
    closed: false,
    count: 3,
    height: 4,
    offset: 2,
    near: 0.1,
    far: 20,
    clipBeforeSurface: 0,
    side: 1,
  });

const createOrthographicViews = (): readonly CameraRigView[] => {
  const first = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20);
  first.position.set(10, 20, 30);
  first.lookAt(10, 20, 0);
  first.updateMatrixWorld(true);
  const second = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20);
  second.position.set(100, 0, 30);
  second.lookAt(100, 0, 0);
  second.updateMatrixWorld(true);
  return [
    {
      id: "first",
      camera: first,
      clipPlanes: [],
      distance: 5,
      imagePlaneVerticalOffset: 3,
    },
    { id: "second", camera: second, clipPlanes: [], distance: 5 },
  ];
};

const OPTIONS = {
  height: 100,
  errorTargetPixels: 1.5,
  clipping: true,
  showImagePlanes: true,
  onFrame: vi.fn(),
  onError: vi.fn(),
};

describe("shared scene camera strip", () => {
  it("follows the strip centre and averages only the visible headings without changing the rig", () => {
    const views = createOrthographicViews();
    views[1].camera.lookAt(200, 0, 30);
    views[1].camera.updateMatrixWorld(true);
    const matrices = views.map(({ camera }) => camera.matrixWorld.clone());
    const strip = createSharedSceneCameraStrip(
      createLayer().layer,
      views,
      OPTIONS
    );
    expect(strip.getMapViewAt(50, 100)?.bearing).toBeCloseTo(0);
    expect(strip.getMapViewAt(100, 100)?.bearing).toBeCloseTo(45);
    expect(strip.getMapViewAt(150, 100)?.bearing).toBeCloseTo(90);
    const position = strip.getScenePositionAt(100)!;
    expect(strip.getMapViewAt(100, 100)?.center).toEqual([
      position.x,
      position.z,
    ]);
    expect(strip.getMapViewAt(NaN, 100)).toBeNull();
    expect(strip.getMapViewAt(100, 0)).toBeNull();
    views.forEach(({ camera }, index) =>
      expect(camera.matrixWorld.equals(matrices[index])).toBe(true)
    );
    strip.dispose();
  });

  it("averages across the bearing wrap instead of flying through the opposite heading", () => {
    const views = createOrthographicViews();
    views.forEach(({ camera }, index) => {
      camera.lookAt(
        camera.position.clone().add(new THREE.Vector3(index ? -0.1 : 0.1, 0, 1))
      );
      camera.updateMatrixWorld(true);
    });
    const strip = createSharedSceneCameraStrip(
      createLayer().layer,
      views,
      OPTIONS
    );
    expect(Math.abs(strip.getMapViewAt(100, 100)!.bearing)).toBeCloseTo(180);
    strip.dispose();
  });
  it("maps clamped strip positions across orthographic camera image planes", () => {
    const strip = createSharedSceneCameraStrip(
      createLayer().layer,
      createOrthographicViews(),
      OPTIONS
    );

    expect(strip.layout).toMatchObject({
      widths: [100, 100],
      offsets: [0, 100],
    });
    expect(strip.getScenePositionAt(0)).toEqual(new THREE.Vector3(8, 23, 25));
    expect(strip.getScenePositionAt(50)).toEqual(new THREE.Vector3(10, 23, 25));
    expect(strip.getScenePositionAt(100)).toEqual(
      new THREE.Vector3(12, 23, 25)
    );
    expect(strip.getScenePositionAt(150)).toEqual(
      new THREE.Vector3(100, 0, 25)
    );
    expect(strip.getScenePositionAt(200)).toEqual(
      new THREE.Vector3(102, 0, 25)
    );
    expect(strip.getScenePositionAt(-10)).toEqual(new THREE.Vector3(8, 23, 25));
    expect(strip.getScenePositionAt(Number.NaN)).toBeNull();
  });

  it("draws only visible segments and wrapped copies with no readback or texture allocation", () => {
    const { layer, scene, passes } = createLayer();
    const views = createViews();
    const viewport = {} as HTMLElement;
    const strip = createSharedSceneCameraStrip(layer, views, {
      ...OPTIONS,
      showImagePlanes: false,
      viewport,
    });
    strip.setPresentation({
      y: 10,
      scale: 2,
      slices: [
        { sourceX: 200, sourceWidth: 50, x: 0, width: 100 },
        { sourceX: 0, sourceWidth: 50, x: 100, width: 100 },
      ],
    });
    strip.update();
    for (const pass of passes) pass();
    const preview = previewMocks.instances[0];
    expect(preview.renderViewport).toHaveBeenCalledTimes(3);
    expect(preview.renderViewport).toHaveBeenNthCalledWith(1, null, viewport);
    expect(preview.renderViewport).toHaveBeenNthCalledWith(
      2,
      views[2].camera,
      viewport,
      { x: -100, y: 10, width: 200, height: 200 },
      views[2].clipPlanes
    );
    expect(preview.renderViewport).toHaveBeenNthCalledWith(
      3,
      views[0].camera,
      viewport,
      { x: 100, y: 10, width: 100, height: 200 },
      views[0].clipPlanes
    );
    expect(preview.renderAsync).not.toHaveBeenCalled();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) expect(object.material.map).toBeNull();
    });
    strip.dispose();
    expect(passes.size).toBe(0);
  });
  beforeEach(() => {
    previewMocks.instances.length = 0;
    previewMocks.jobs.length = 0;
    OPTIONS.onFrame.mockClear();
    OPTIONS.onError.mockClear();
  });

  it("keeps embedded diagnostic image planes GPU-only too", () => {
    const { layer } = createLayer();
    const strip = createSharedSceneCameraStrip(layer, createViews(), {
      ...OPTIONS,
      viewport: {} as HTMLElement,
    });
    strip.setPresentation({
      y: 0,
      scale: 1,
      slices: [{ sourceX: 0, sourceWidth: 50, x: 0, width: 50 }],
    });
    strip.update();
    expect(previewMocks.instances).toHaveLength(2);
    expect(previewMocks.instances[1].renderTexture).toHaveBeenCalledOnce();
    expect(
      previewMocks.instances.every(
        (preview) => preview.renderAsync.mock.calls.length === 0
      )
    ).toBe(true);
    expect(OPTIONS.onFrame).not.toHaveBeenCalled();
    strip.dispose();
    expect(previewMocks.instances[1].dispose).toHaveBeenCalledOnce();
  });

  it("waits for presentation before publishing or capturing embedded cameras", () => {
    const { layer, scene, views } = createLayer();
    const rig = createViews();
    const strip = createSharedSceneCameraStrip(layer, rig, {
      ...OPTIONS,
      viewport: {} as HTMLElement,
    });

    strip.update();
    expect(views).toHaveLength(0);
    expect(previewMocks.instances).toHaveLength(1);
    expect(layer.requestScreenRender).not.toHaveBeenCalled();
    expect(strip.getStats().activeCameras).toBe(0);
    expect(
      (scene.children[0] as THREE.Group).children.every(
        (child) => !child.visible
      )
    ).toBe(true);

    strip.setPresentation({
      y: 0,
      scale: 1,
      slices: [{ sourceX: 0, sourceWidth: 50, x: 0, width: 50 }],
    });
    strip.update();
    expect(views).toHaveLength(1);
    expect(strip.getStats().activeCameras).toBe(1);
    expect(previewMocks.instances[1].renderTexture).toHaveBeenCalledWith(
      rig[0].camera,
      50,
      100,
      expect.any(Array)
    );
  });

  it("retires hidden camera demand and capture targets when the viewport moves", () => {
    const { layer, scene, views } = createLayer();
    const rig = createViews();
    const strip = createSharedSceneCameraStrip(layer, rig, {
      ...OPTIONS,
      viewport: {} as HTMLElement,
    });
    strip.setPresentation({
      y: 0,
      scale: 1,
      slices: [{ sourceX: 0, sourceWidth: 50, x: 0, width: 50 }],
    });
    strip.update();
    const retiredCapture = previewMocks.instances[1];

    strip.setPresentation({
      y: 0,
      scale: 1,
      slices: [{ sourceX: 150, sourceWidth: 100, x: 0, width: 100 }],
    });
    expect(views).toHaveLength(1);
    expect([...views.values()][0].camera).toBe(rig[2].camera);
    expect(retiredCapture.dispose).toHaveBeenCalledOnce();
    expect((scene.children[0] as THREE.Group).children[0].visible).toBe(false);
    expect((scene.children[0] as THREE.Group).children[2].visible).toBe(true);

    strip.update();
    expect(previewMocks.instances[2].renderTexture).toHaveBeenCalledWith(
      rig[2].camera,
      100,
      100,
      rig[2].clipPlanes
    );
  });

  it("deduplicates overlapping presentation slices into one active camera demand", () => {
    const { layer, views } = createLayer();
    const strip = createSharedSceneCameraStrip(layer, createViews(), {
      ...OPTIONS,
      showImagePlanes: false,
      viewport: {} as HTMLElement,
    });

    strip.setPresentation({
      y: 0,
      scale: 1,
      slices: [
        { sourceX: 0, sourceWidth: 150, x: 0, width: 150 },
        { sourceX: 50, sourceWidth: 100, x: 50, width: 100 },
      ],
    });

    expect(views).toHaveLength(2);
    expect(strip.getStats().activeCameras).toBe(2);
    expect(layer.setTileCameraView).toHaveBeenCalledTimes(2);
  });

  it("registers variable-width receiver demand from the strip layout", () => {
    const { layer, views } = createLayer();
    const strip = createSharedSceneCameraStrip(layer, createViews(), OPTIONS);

    expect(strip.layout.widths).toEqual([50, 100, 100]);
    expect(strip.layout.offsets).toEqual([0, 50, 150]);
    expect([...views.values()].map(({ viewport }) => viewport)).toEqual([
      [50, 100],
      [100, 100],
      [100, 100],
    ]);
    expect(
      [...views.values()].every(
        ({ role }) => role === TILE_CAMERA_ROLE.RECEIVER
      )
    ).toBe(true);
    expect(
      [...views.values()].every(
        (view) => view.priority === TILE_CAMERA_PRIORITY.SECONDARY
      )
    ).toBe(true);
  });

  it("changes the priority camera without adding views or allocating another preview", () => {
    const { layer, views } = createLayer();
    const strip = createSharedSceneCameraStrip(layer, createViews(), OPTIONS);
    const cameras = [...views.values()].map((view) => view.camera);
    strip.setPriorityCamera(1);
    expect([...views.values()].map((view) => view.priority)).toEqual([0, 2, 0]);
    strip.setPriorityCamera(null);
    expect([...views.values()].map((view) => view.priority)).toEqual([0, 0, 0]);
    expect([...views.values()].map((view) => view.camera)).toEqual(cameras);
    expect(previewMocks.instances).toHaveLength(1);
    expect(() => strip.setPriorityCamera(9)).toThrow();
    strip.dispose();
  });

  it("moves cameras, image planes and clipping together and ignores readback from the old elevation", async () => {
    const { layer, scene, views } = createLayer();
    const rig = createViews();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -4);
    const initial = rig.map((view) => view.camera.position.y);
    const adjusted = rig.map((view) => ({
      ...view,
      clipPlanes: [plane.clone()],
    }));
    const strip = createSharedSceneCameraStrip(layer, adjusted, OPTIONS);
    strip.update();
    strip.setElevationOffset(12);
    expect([...views.values()].map((view) => view.camera.position.y)).toEqual(
      initial.map((y) => y + 12)
    );
    expect(adjusted.map((view) => view.clipPlanes[0].constant)).toEqual([
      -16, -16, -16,
    ]);
    expect(
      (scene.children[0] as THREE.Group).children[0].position.y
    ).toBeCloseTo(initial[0] + 12);
    const job = previewMocks.jobs[0];
    job.callback(
      new Uint8Array(job.width * job.height * 4),
      job.width,
      job.height
    );
    job.resolve(true);
    await flush();
    expect(OPTIONS.onFrame).not.toHaveBeenCalled();
    strip.setElevationOffset(0);
    expect([...views.values()].map((view) => view.camera.position.y)).toEqual(
      initial
    );
    expect(previewMocks.instances).toHaveLength(1);
    strip.dispose();
  });

  it("keeps one readback in flight and hides helpers only during submission", () => {
    const { layer, scene } = createLayer();
    const strip = createSharedSceneCameraStrip(layer, createViews(), OPTIONS);
    const helpers = scene.children[0] as THREE.Group;
    const renderAsync = previewMocks.instances[0].renderAsync;
    renderAsync.mockImplementationOnce((...args: unknown[]) => {
      expect(helpers.visible).toBe(false);
      return new Promise<boolean>((resolve) => {
        previewMocks.jobs.push({
          callback: args[3] as (
            pixels: Uint8Array,
            width: number,
            height: number
          ) => void,
          width: args[1] as number,
          height: args[2] as number,
          clippingPlanes: args[4] as readonly THREE.Plane[],
          resolve,
        });
      });
    });

    strip.update();
    strip.update();
    expect(renderAsync).toHaveBeenCalledOnce();
    expect(helpers.visible).toBe(true);
    expect(strip.getStats().busy).toBe(true);
  });

  it("retains completed texture data while the next view is pending and emits prefix offsets", async () => {
    const { layer, scene } = createLayer();
    const strip = createSharedSceneCameraStrip(layer, createViews(), OPTIONS);
    const helpers = scene.children[0] as THREE.Group;
    const firstTexture = (
      helpers.children[0] as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.MeshBasicMaterial
      >
    ).material.map as THREE.DataTexture;

    strip.update();
    const first = previewMocks.jobs[0];
    const firstPixels = new Uint8Array(first.width * first.height * 4).fill(7);
    first.callback(firstPixels, first.width, first.height);
    first.resolve(true);
    await flush();
    expect(OPTIONS.onFrame).toHaveBeenLastCalledWith(0, firstPixels, 50, 100);

    strip.update();
    expect(previewMocks.jobs).toHaveLength(2);
    expect((firstTexture.image.data as Uint8Array)[0]).toBe(7);
    const second = previewMocks.jobs[1];
    const secondPixels = new Uint8Array(second.width * second.height * 4).fill(
      9
    );
    second.callback(secondPixels, second.width, second.height);
    expect(OPTIONS.onFrame).toHaveBeenLastCalledWith(
      50,
      secondPixels,
      100,
      100
    );
  });

  it("passes each view's clipping planes and omits them when clipping is disabled", () => {
    const rigViews = createViews();
    const enabled = createSharedSceneCameraStrip(
      createLayer().layer,
      rigViews,
      OPTIONS
    );
    enabled.update();
    expect(previewMocks.jobs[0].clippingPlanes).toBe(rigViews[0].clipPlanes);

    const disabled = createSharedSceneCameraStrip(
      createLayer().layer,
      rigViews,
      {
        ...OPTIONS,
        clipping: false,
      }
    );
    disabled.update();
    expect(previewMocks.jobs[1].clippingPlanes).toEqual([]);
  });

  it("ignores late frames after disposal and removes only owned registrations", async () => {
    const { layer, scene, views } = createLayer();
    const first = createSharedSceneCameraStrip(layer, createViews(), OPTIONS);
    const second = createSharedSceneCameraStrip(layer, createViews(), OPTIONS);
    expect(views).toHaveLength(6);

    first.update();
    const late = previewMocks.jobs[0];
    first.dispose();
    expect(scene.children).toHaveLength(1);
    expect(views).toHaveLength(3);
    late.callback(
      new Uint8Array(late.width * late.height * 4),
      late.width,
      late.height
    );
    late.resolve(true);
    await flush();
    expect(OPTIONS.onFrame).not.toHaveBeenCalled();
    expect(first.getStats().completed).toBe(0);
    expect(previewMocks.instances[0].dispose).toHaveBeenCalledOnce();
    second.dispose();
    expect(views).toHaveLength(0);
  });
});
