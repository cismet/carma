// @vitest-environment jsdom

import { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_PRIORITY,
  TILE_CAMERA_ROLE,
  TILE_MAIN_OBSERVER_ID,
} from "../../core/tile-camera-demand";
import type { RuntimeTile } from "./three-tiles-runtime-types";
import { tilesQueuePriorityCallback } from "./three-tiles-runtime-vendor";
import { buildThreeTilesRuntime } from "./three-tiles-runtime";
import type { ThreeTilesRuntimeState } from "./three-tiles-runtime-context";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:view-refresh-worker",
  });
});

type TestRenderer = TilesRenderer & {
  frameCount: number;
  loadingTiles: Set<Tile>;
  queuedTiles: Tile[];
};

const buildMap = () => {
  const handlers = new Map<string, () => void>();
  let moving = false;
  const map = {
    on: vi.fn((event: string, handler: () => void) =>
      handlers.set(event, handler)
    ),
    off: vi.fn(),
    triggerRepaint: vi.fn(),
    getCenter: vi.fn(() => ({ lng: 7.2, lat: 51.2 })),
    isMoving: () => moving,
    isZooming: () => moving,
  } as unknown as MaplibreMap;
  return {
    map,
    handlers,
    setMoving: (value: boolean) => {
      moving = value;
    },
  };
};

const buildTile = (error = 40) =>
  ({
    parent: null,
    children: [],
    refine: "REPLACE",
    geometricError: error,
    internal: {
      loadingState: 0,
      depth: 1,
      hasContent: true,
      hasRenderableContent: true,
      hasUnrenderableContent: false,
    },
    traversal: {
      inFrustum: true,
      error,
      distanceFromCamera: 1,
      visible: false,
      active: false,
    },
    engineData: {
      boundingVolume: {
        distanceToPoint: () => 1,
        intersectsFrustum: () => false,
        getAABB: (box: THREE.Box3) =>
          box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)),
        getSphere: (sphere: THREE.Sphere) => sphere.set(new THREE.Vector3(), 1),
      },
    },
  } as unknown as Tile);

let runtimeIndex = 0;
const mount = (
  update: (renderer: TestRenderer) => void = () => undefined,
  shouldTraverse: () => boolean = () => true,
  providesTerrain = true
) => {
  let renderer!: TestRenderer;
  vi.spyOn(TilesRenderer.prototype, "update").mockImplementation(function () {
    renderer = this as TestRenderer;
    if (shouldTraverse()) renderer.frameCount += 1;
    update(renderer);
  });
  const host = buildMap();
  const layerId = `refresh-${runtimeIndex++}`;
  const runtime = buildThreeTilesRuntime(layerId, "mesh.json", [7.2, 51.2], {
    providesTerrain,
    baseErrorTargetPixels: 16,
    diagnostics: true,
    entry: {
      levels: [{ level: 0, geometricError: 40, bytes: 1 }],
    },
  });
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.updateMatrixWorld(true);
  const frame = {
    map: host.map,
    renderCamera: camera,
    lodCamera: camera,
    lookTarget: new THREE.Vector3(),
    viewport: new THREE.Vector2(800, 600),
  };
  runtime.scene.onAdd?.(host.map);
  runtime.scene.update(frame);
  return { ...host, runtime, renderer, camera, frame, layerId };
};

describe("three tiles current-view refresh", () => {
  it("requests the immediate LOD after zoom-out, pan and zoom-in even above the startup error ceiling", () => {
    const mounted = mount();
    try {
      const state = [
        ...(
          window as unknown as {
            __carmaTiles3d: Set<ThreeTilesRuntimeState>;
          }
        ).__carmaTiles3d,
      ].find((s) => s.layerId === mounted.layerId)!;
      const parent = buildTile(500);
      const child = buildTile(250);
      const grandchild = buildTile(125);
      parent.internal.loadingState = 4;
      parent.children = [child];
      child.parent = parent;
      child.children = [grandchild];
      grandchild.parent = child;
      for (const tile of [parent, child, grandchild])
        delete (tile.engineData!.boundingVolume as { getAABB?: unknown })
          .getAABB;
      state.displayedMeshFrontier.add(parent);
      vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
        (tile, target) => {
          Object.assign(target, {
            inView: true,
            error: tile.geometricError,
            distanceFromCamera: 1,
          });
        }
      );
      const target = { inView: false, error: 0, distanceFromCamera: 0 };
      mounted.renderer.calculateTileViewErrorWithPlugin(child, target);
      expect(target.error).toBe(state.effectiveErrorTarget);
      mounted.renderer.calculateTileViewErrorWithPlugin(grandchild, target);
      expect(target.error).toBe(125);
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("publishes the loaded parent while sibling preprocessing is still asynchronous", () => {
    const mounted = mount();
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const parent = buildTile(40);
      parent.internal.loadingState = 4;
      parent.engineData!.scene = new THREE.Group();
      parent.engineData!.boundingVolume!.intersectsFrustum = () => true;
      delete (parent.engineData!.boundingVolume as { getAABB?: unknown })
        .getAABB;
      parent.children = [
        { parent, children: [], geometricError: 20 } as unknown as Tile,
      ];
      Object.assign(mounted.renderer, { rootTileset: { root: parent } });
      vi.spyOn(
        mounted.renderer,
        "ensureChildrenArePreprocessed"
      ).mockImplementation(() => undefined);
      vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
        (_tile, target) => {
          Object.assign(target, {
            inView: true,
            error: 40,
            distanceFromCamera: 1,
          });
        }
      );
      mounted.runtime.scene.update(mounted.frame);
      expect(errors).not.toHaveBeenCalled();
      expect(mounted.renderer.group.children).toContain(
        parent.engineData!.scene
      );
      expect(mounted.renderer.visibleTiles.has(parent)).toBe(true);
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("loads startup ancestors without parking moving views, then returns to the skip strategy", () => {
    const ancestorPasses: boolean[] = [];
    const mounted = mount((renderer) =>
      ancestorPasses.push(renderer.loadAncestors)
    );
    try {
      expect(ancestorPasses).toEqual([true]);
      mounted.setMoving(true);
      mounted.runtime.scene.update(mounted.frame);
      expect(ancestorPasses).toEqual([true, true]);
      const state = [
        ...(
          window as unknown as {
            __carmaTiles3d: Set<ThreeTilesRuntimeState>;
          }
        ).__carmaTiles3d,
      ].find((s) => s.layerId === mounted.layerId)!;
      state.displayedMeshFrontier.add(buildTile(20));
      mounted.runtime.scene.update(mounted.frame);
      expect(ancestorPasses).toEqual([true, true, false]);
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("waits for content events instead of repainting continuously for network work", () => {
    const mounted = mount(
      () => undefined,
      () => false,
      false
    );
    try {
      Object.assign(mounted.renderer.stats, {
        queued: 5,
        downloading: 2,
        parsing: 1,
      });
      vi.mocked(mounted.map.triggerRepaint).mockClear();
      mounted.runtime.scene.update(mounted.frame);
      expect(mounted.map.triggerRepaint).not.toHaveBeenCalled();
      mounted.renderer.dispatchEvent({ type: "needs-update" });
      expect(mounted.map.triggerRepaint).toHaveBeenCalled();
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("requests all immediate siblings once when admitting an in-view refinement", () => {
    const admitted: Tile[] = [];
    vi.spyOn(
      TilesRenderer.prototype,
      "queueTileForDownload"
    ).mockImplementation((tile) => {
      admitted.push(tile);
      tile.internal.loadingState = 1;
    });
    const mounted = mount();
    try {
      const state = [
        ...(
          window as unknown as { __carmaTiles3d: Set<ThreeTilesRuntimeState> }
        ).__carmaTiles3d,
      ].find((candidate) => candidate.layerId === mounted.layerId)!;
      const parent = buildTile(20);
      parent.internal.loadingState = 4;
      const children = Array.from({ length: 4 }, () => buildTile(6));
      parent.children = children;
      for (const child of children) child.parent = parent;
      children[0].engineData!.boundingVolume!.intersectsFrustum = () => true;
      vi.spyOn(
        mounted.renderer,
        "ensureChildrenArePreprocessed"
      ).mockImplementation(() => undefined);
      vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
        (tile, target) =>
          Object.assign(target, {
            inView: tile === parent || tile === children[0],
            error: tile.geometricError,
            distanceFromCamera: 1,
          })
      );
      for (const tile of [parent, ...children])
        delete (tile.engineData!.boundingVolume as { getAABB?: unknown })
          .getAABB;
      state.extentFloorArmed = false;
      state.displayedMeshFrontier = new Set([parent]);
      state.requestedErrorTarget = 4;
      state.effectiveErrorTarget = 4;
      state.memoryErrorTarget = 4;
      mounted.renderer.queueTileForDownload(children[0]);
      expect(new Set(admitted)).toEqual(new Set(children));
      expect(admitted).toHaveLength(4);
      expect(state.meshRefinementSupport).toEqual(new Set(children));
      expect(
        children.every(
          (tile) =>
            (tile as RuntimeTile).cameraPriority ===
            TILE_CAMERA_PRIORITY.COVERAGE_REPAIR
        )
      ).toBe(true);
      mounted.renderer.queueTileForDownload(children[0]);
      expect(admitted).toHaveLength(4);
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it.each([
    { published: true, parentError: 8, memoryTarget: 4, keepChildren: true },
    { published: true, parentError: 8, memoryTarget: 12, keepChildren: true },
    {
      published: true,
      parentError: 8,
      memoryTarget: 4,
      keepChildren: true,
      previousCount: 1,
    },
    { published: true, parentError: 3, memoryTarget: 4, keepChildren: false },
    { published: false, parentError: 8, memoryTarget: 4, keepChildren: false },
  ])(
    "separates motion admission from idle-detail retention: %j",
    ({
      published,
      parentError,
      memoryTarget,
      keepChildren,
      previousCount = 4,
    }) => {
      const mounted = mount();
      try {
        const state = [
          ...(
            window as unknown as { __carmaTiles3d: Set<ThreeTilesRuntimeState> }
          ).__carmaTiles3d,
        ].find((candidate) => candidate.layerId === mounted.layerId)!;
        const parent = buildTile(parentError);
        const children = Array.from({ length: 4 }, () => buildTile(2));
        parent.children = children;
        for (const child of children) child.parent = parent;
        for (const tile of [parent, ...children]) {
          tile.internal.loadingState = 4;
          tile.engineData!.scene = new THREE.Group();
          tile.engineData!.boundingVolume!.intersectsFrustum = () => true;
          delete (tile.engineData!.boundingVolume as { getAABB?: unknown })
            .getAABB;
        }
        Object.assign(mounted.renderer, { rootTileset: { root: parent } });
        vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
          (tile, target) =>
            Object.assign(target, {
              inView: true,
              error: tile.geometricError,
              distanceFromCamera: 1,
            })
        );
        state.requestedErrorTarget = 4;
        state.effectiveErrorTarget = 12;
        state.memoryErrorTarget = memoryTarget;
        mounted.renderer.errorTarget = 12;
        state.displayedMeshFrontier = new Set(
          published ? children.slice(0, previousCount) : []
        );
        mounted.setMoving(true);
        mounted.camera.position.x += 1;
        mounted.camera.updateMatrixWorld(true);
        mounted.runtime.scene.update(mounted.frame);
        expect(state.displayedMeshFrontier).toEqual(
          new Set(keepChildren ? children : [parent])
        );
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it.each([false, true])(
    "reattaches a selected payload on a same-error pan (active-only parent=%s)",
    (activeOnly) => {
      const mounted = mount();
      try {
        const tile = buildTile(0.1);
        tile.internal.loadingState = 4;
        tile.engineData!.boundingVolume!.intersectsFrustum = () => true;
        delete (tile.engineData!.boundingVolume as { getAABB?: unknown })
          .getAABB;
        const model = new THREE.Group();
        tile.engineData!.scene = model;
        mounted.renderer.group.matrixWorld.identity();
        Object.assign(mounted.renderer, { rootTileset: { root: tile } });
        vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
          (_tile, target) =>
            Object.assign(target, {
              inView: true,
              error: 1,
              distanceFromCamera: 1,
            })
        );
        mounted.renderer.visibleTiles.add(tile);
        if (activeOnly) {
          mounted.renderer.activeTiles.add(tile);
          model.parent = mounted.renderer.group;
        }
        const used = vi.spyOn(mounted.renderer, "markTileUsed");
        mounted.camera.position.x += 1;
        mounted.camera.updateMatrixWorld(true);
        mounted.runtime.scene.update(mounted.frame);
        expect(mounted.renderer.group.children).toContain(model);
        expect(model.parent).toBe(mounted.renderer.group);
        expect(mounted.renderer.activeTiles.has(tile)).toBe(true);
        expect(mounted.renderer.visibleTiles.has(tile)).toBe(true);
        expect(tile.internal.loadingState).toBe(4);
        used.mockClear();
        mounted.camera.position.x += 1;
        mounted.camera.updateMatrixWorld(true);
        mounted.runtime.scene.update(mounted.frame);
        expect(used).toHaveBeenCalledWith(tile);
        expect(
          mounted.renderer.group.children.filter((child) => child === model)
        ).toHaveLength(1);
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it.each(["perspective", "padded", "orthographic"] as const)(
    "uses clipped visible-depth SSE for native traversal too (%s)",
    (projection) => {
      const mounted = mount();
      try {
        const state = [
          ...(
            window as unknown as {
              __carmaTiles3d: Set<ThreeTilesRuntimeState>;
            }
          ).__carmaTiles3d,
        ].find((s) => s.layerId === mounted.layerId)!;
        state.extentFloorArmed = false;
        // Test the geometric SSE independently of the first-image LOD cap.
        state.displayedMeshFrontier.add(buildTile(1));
        mounted.renderer.group.matrixWorld.identity();
        const camera =
          projection === "orthographic"
            ? new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000)
            : new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
        camera.position.z = 10;
        if (projection === "padded")
          camera.setViewOffset(1000, 1000, 200, 0, 1000, 1000);
        camera.updateMatrixWorld(true);
        state.tileCameraDemand = createTileCameraDemand(
          snapshotTileCameraViews([
            {
              id: TILE_MAIN_OBSERVER_ID,
              camera,
              viewport: [1000, 1000],
              errorTargetPixels: state.effectiveErrorTarget,
              role: TILE_CAMERA_ROLE.RECEIVER,
            },
          ])
        );
        // Deliberately overestimated legacy error must not survive via max().
        vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
          (_tile, target) =>
            Object.assign(target, {
              inView: true,
              error: 10000,
              distanceFromCamera: 1,
            })
        );
        const errors: number[] = [];
        for (const farZ of [9, 5]) {
          const bounds = new THREE.Box3(
            new THREE.Vector3(5, -1, -10),
            new THREE.Vector3(6, 1, farZ)
          );
          const tile = buildTile(1);
          tile.engineData!.boundingVolume!.getAABB = (box) => box.copy(bounds);
          const expected =
            state.tileCameraDemand.evaluate(bounds, 1).errorRatio *
            state.effectiveErrorTarget;
          const target = { inView: false, error: 0, distanceFromCamera: 0 };
          mounted.renderer.calculateTileViewErrorWithPlugin(tile, target);
          expect(target.inView).toBe(true);
          expect(target.error).toBeCloseTo(expected, 8);
          expect(target.error).toBeLessThan(10000);
          errors.push(target.error);
        }
        expect(errors[0]).toBeCloseTo(errors[1], 8);
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it.each([true, false])(
    "keeps primary detail when a coarse overlapping camera expands a pressured pool (terrain=%s)",
    (providesTerrain) => {
      const mounted = mount(
        () => undefined,
        () => true,
        providesTerrain
      );
      try {
        const state = [
          ...(
            window as unknown as { __carmaTiles3d: Set<ThreeTilesRuntimeState> }
          ).__carmaTiles3d,
        ].find((s) => s.layerId === mounted.layerId)!;
        state.requestedErrorTarget = 2;
        // This analytic tile fixture is already in the camera's local frame.
        state.orientationGroup.rotation.set(0, 0, 0);
        state.effectiveErrorTarget = 8;
        state.memoryErrorTarget = 8;
        mounted.renderer.errorTarget = 8;
        const camera = new THREE.OrthographicCamera(
          -100,
          100,
          100,
          -100,
          0.1,
          100
        );
        camera.position.z = 10;
        camera.updateMatrixWorld(true);
        const secondary = {
          id: "wide-secondary",
          camera,
          viewport: [800, 600] as const,
          errorTargetPixels: 0.5,
          role: TILE_CAMERA_ROLE.RECEIVER,
          priority: TILE_CAMERA_PRIORITY.SECONDARY,
        };
        mounted.runtime.scene.update({
          ...mounted.frame,
          tileCameraViews: snapshotTileCameraViews([secondary]),
        });
        const views = state.tileCameraDemand.views;
        expect(
          views.find((v) => v.id === TILE_MAIN_OBSERVER_ID)!.errorTargetPixels
        ).toBe(2);
        expect(
          views.find((v) => v.id === secondary.id)!.errorTargetPixels
        ).toBe(0.5);
        const bounds = new THREE.Box3(
          new THREE.Vector3(-1, -1, -11),
          new THREE.Vector3(1, 1, -9)
        );
        const primaryOnly = createTileCameraDemand(
          views.filter((v) => v.id === TILE_MAIN_OBSERVER_ID)
        );
        const primaryRatio = primaryOnly.evaluate(bounds, 1).errorRatio;
        expect(state.tileCameraDemand.evaluate(bounds, 1).errorRatio).toBe(
          primaryRatio
        );
        for (const zoom of [0.5, 0.25, 0.125, 1, 0.25]) {
          camera.zoom = zoom;
          camera.updateProjectionMatrix();
          mounted.runtime.scene.update({
            ...mounted.frame,
            tileCameraViews: snapshotTileCameraViews([secondary]),
          });
          expect(state.tileCameraDemand.evaluate(bounds, 1).errorRatio).toBe(
            primaryRatio
          );
        }
        const receiver = buildTile(1);
        receiver.engineData!.boundingVolume!.getAABB = (box) =>
          box.copy(bounds);
        receiver.engineData!.boundingVolume!.distanceToPoint = () => 10000;
        receiver.engineData!.boundingVolume!.intersectsFrustum = () => true;
        const target = {
          inView: false,
          error: 0,
          distanceFromCamera: Infinity,
        };
        state.tiles!.calculateTileViewErrorWithPlugin(receiver, target);
        expect(target.inView).toBe(true);
        expect(target.error).toBeGreaterThanOrEqual(
          primaryRatio * state.effectiveErrorTarget
        );
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("orders camera demand before distance/SSE while retaining native order within a rank", () => {
    const low = buildTile() as RuntimeTile;
    const high = buildTile() as RuntimeTile;
    low.priority = 1000;
    high.priority = 1;
    low.cameraPriority = TILE_CAMERA_PRIORITY.SECONDARY;
    high.cameraPriority = TILE_CAMERA_PRIORITY.FOCUS;
    expect(tilesQueuePriorityCallback(high, low)).toBeGreaterThan(0);
    high.cameraPriority = TILE_CAMERA_PRIORITY.SECONDARY;
    expect(tilesQueuePriorityCallback(low, high)).toBeGreaterThan(0);
  });

  it.each([
    ["download", TILE_CAMERA_PRIORITY.SECONDARY],
    ["parse", TILE_CAMERA_PRIORITY.SECONDARY],
    ["download", TILE_CAMERA_PRIORITY.FOCUS],
    ["parse", TILE_CAMERA_PRIORITY.FOCUS],
  ] as const)(
    "arbitrates %s work between main and camera rank %s, then resumes the parked promise",
    async (phase, cameraPriority) => {
      vi.useFakeTimers();
      const mounted = mount();
      mounted.renderer.parseQueue.maxJobs = 1;
      mounted.renderer.downloadQueue.maxJobsPerOrigin = 1;
      try {
        const state = [
          ...(
            window as unknown as { __carmaTiles3d: Set<ThreeTilesRuntimeState> }
          ).__carmaTiles3d,
        ].find((s) => s.layerId === mounted.layerId)!;
        state.meshBaseCoverageReady = true;
        state.extentFloorArmed = false;
        const extraCamera = new THREE.OrthographicCamera(
          -5,
          5,
          5,
          -5,
          0.1,
          100
        );
        extraCamera.position.z = 10;
        state.tileCameraDemand = createTileCameraDemand(
          snapshotTileCameraViews([
            {
              id: "array",
              camera: extraCamera,
              viewport: [100, 100],
              errorTargetPixels: 2,
              role: TILE_CAMERA_ROLE.RECEIVER,
              priority: cameraPriority,
            },
          ])
        );
        const primary = buildTile(1);
        primary.engineData!.boundingVolume!.intersectsFrustum = () => true;
        primary.engineData!.boundingVolume!.getAABB = (box) =>
          box.set(new THREE.Vector3(19, -1, -1), new THREE.Vector3(21, 1, 1));
        const secondary = buildTile(1);
        const higher =
          cameraPriority > TILE_CAMERA_PRIORITY.PRIMARY ? secondary : primary;
        const lower = higher === primary ? secondary : primary;
        higher.internal.loadingState = 2;
        for (const tile of [primary, secondary]) {
          tile.internal.renderer = mounted.renderer;
          mounted.renderer.loadingTiles.add(tile);
        }
        let finish!: (result: string) => void;
        const higherJob = vi.fn(
          () =>
            new Promise<string>((resolve) => {
              finish = resolve;
            })
        );
        const lowerJob = vi.fn().mockResolvedValue("lower");
        const add = (tile: Tile, callback: () => Promise<string>) =>
          phase === "parse"
            ? mounted.renderer.parseQueue.add(tile, callback)
            : mounted.renderer.downloadQueue.add(
                "https://example.test/priority",
                tile,
                callback
              );
        const lowerPromise = add(lower, lowerJob);
        const higherPromise = add(higher, higherJob);
        await vi.advanceTimersByTimeAsync(50);
        expect(higherJob).toHaveBeenCalledOnce();
        expect(lowerJob).not.toHaveBeenCalled();
        mounted.renderer.loadingTiles.delete(higher);
        finish("higher");
        await expect(higherPromise).resolves.toBe("higher");
        await vi.advanceTimersByTimeAsync(50);
        await expect(lowerPromise).resolves.toBe("lower");
        expect(lowerJob).toHaveBeenCalledOnce();
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it.each(["download", "parse"] as const)(
    "prioritizes %s family repair over viewport refinement while parking the baseline",
    async (phase) => {
      vi.useFakeTimers();
      const mounted = mount();
      try {
        const states = (
          window as unknown as { __carmaTiles3d: Set<ThreeTilesRuntimeState> }
        ).__carmaTiles3d;
        const state = [...states].find((s) => s.layerId === mounted.layerId)!;
        state.meshBaseCoverageReady = true;
        state.extentFloorArmed = true;
        state.extentGeometricError = 40;
        const visible = buildTile(1);
        visible.engineData!.boundingVolume!.intersectsFrustum = () => true;
        visible.internal.loadingState = 2;
        const floor = buildTile(40);
        const support = buildTile(1);
        for (const tile of [visible, floor, support])
          tile.internal.renderer = mounted.renderer;
        state.meshRefinementSupport.add(support);
        mounted.renderer.loadingTiles.add(visible);
        let finish!: (result: string) => void;
        const visibleJob = vi.fn(
          () =>
            new Promise<string>((resolve) => {
              finish = resolve;
            })
        );
        const floorJob = vi.fn().mockResolvedValue("floor");
        const supportJob = vi.fn().mockResolvedValue("support");
        const add = (tile: Tile, callback: () => Promise<string>) =>
          phase === "parse"
            ? mounted.renderer.parseQueue.add(tile, callback)
            : mounted.renderer.downloadQueue.add(
                "https://example.test/tile",
                tile,
                callback
              );
        const visiblePromise = add(visible, visibleJob);
        const floorPromise = add(floor, floorJob);
        const supportPromise = add(support, supportJob);
        await vi.advanceTimersByTimeAsync(50);
        expect(visibleJob).toHaveBeenCalledOnce();
        expect(floorJob).not.toHaveBeenCalled();
        expect(supportJob).toHaveBeenCalledOnce();
        expect((support as RuntimeTile).cameraPriority).toBe(
          TILE_CAMERA_PRIORITY.COVERAGE_REPAIR
        );
        mounted.renderer.loadingTiles.delete(visible);
        finish("visible");
        await expect(visiblePromise).resolves.toBe("visible");
        await vi.advanceTimersByTimeAsync(50);
        await expect(floorPromise).resolves.toBe("floor");
        await expect(supportPromise).resolves.toBe("support");
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it("parses ready viewport work while a higher-priority sibling still downloads", async () => {
    vi.useFakeTimers();
    const mounted = mount();
    try {
      const state = [
        ...(
          window as unknown as { __carmaTiles3d: Set<ThreeTilesRuntimeState> }
        ).__carmaTiles3d,
      ].find((candidate) => candidate.layerId === mounted.layerId)!;
      const downloading = buildTile(6);
      downloading.internal.loadingState = 2;
      state.meshRefinementSupport.add(downloading);
      mounted.renderer.loadingTiles.add(downloading);
      const ready = buildTile(6);
      ready.engineData!.boundingVolume!.intersectsFrustum = () => true;
      const parse = vi.fn().mockResolvedValue("ready");
      mounted.setMoving(true);
      const result = mounted.renderer.parseQueue.add(ready, parse);
      await vi.advanceTimersByTimeAsync(50);
      expect(parse).toHaveBeenCalledOnce();
      await expect(result).resolves.toBe("ready");
      expect(downloading.internal.loadingState).toBe(2);
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("wakes a parked decoded-buffer job when its bounds enter the moving camera", async () => {
    vi.useFakeTimers();
    const mounted = mount();
    try {
      const state = [
        ...(
          window as unknown as { __carmaTiles3d: Set<ThreeTilesRuntimeState> }
        ).__carmaTiles3d,
      ].find((s) => s.layerId === mounted.layerId)!;
      const support = buildTile(40);
      state.extentFloorArmed = true;
      state.extentGeometricError = 40;
      mounted.setMoving(true);
      const callback = vi.fn().mockResolvedValue("ready");
      const result = mounted.renderer.parseQueue.add(support, callback);
      await vi.advanceTimersByTimeAsync(50);
      expect(callback).not.toHaveBeenCalled();
      support.engineData!.boundingVolume!.intersectsFrustum = () => true;
      mounted.camera.position.x += 1;
      mounted.camera.updateMatrixWorld(true);
      mounted.runtime.scene.update(mounted.frame);
      await vi.advanceTimersByTimeAsync(50);
      await expect(result).resolves.toBe("ready");
      expect(callback).toHaveBeenCalledOnce();
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("preempts still-needed background parsing when viewport work arrives across the yield", async () => {
    vi.useFakeTimers();
    const mounted = mount();
    try {
      const state = [
        ...(
          window as unknown as {
            __carmaTiles3d: Set<ThreeTilesRuntimeState>;
          }
        ).__carmaTiles3d,
      ].find((s) => s.layerId === mounted.layerId)!;
      const background = buildTile(40);
      state.extentFloorArmed = true;
      state.extentGeometricError = 40;
      const foreground = buildTile(1);
      foreground.engineData!.boundingVolume!.intersectsFrustum = () => true;
      const backgroundCallback = vi.fn().mockResolvedValue("background");
      const foregroundCallback = vi.fn().mockResolvedValue("foreground");
      const disposed = vi.fn();
      mounted.renderer.lruCache.add(background, disposed);
      mounted.renderer.parseQueue.maxJobs = 1;
      const result = mounted.renderer.parseQueue.add(
        background,
        backgroundCallback
      );
      const rejected = expect(result).rejects.toMatchObject({
        name: "AbortError",
      });
      mounted.renderer.parseQueue.tryRunJobs();
      const next = mounted.renderer.parseQueue.add(
        foreground,
        foregroundCallback
      );
      await vi.advanceTimersByTimeAsync(50);
      await rejected;
      await expect(next).resolves.toBe("foreground");
      expect(backgroundCallback).not.toHaveBeenCalled();
      expect(disposed).toHaveBeenCalledOnce();
      expect(foregroundCallback).toHaveBeenCalledOnce();
      // The tile stays eligible for a later request, not permanently disabled.
      expect(state.extentFloorArmed).toBe(true);
      expect(background.geometricError).toBe(state.extentGeometricError);
      const retried = mounted.renderer.parseQueue.add(
        background,
        backgroundCallback
      );
      await vi.advanceTimersByTimeAsync(50);
      await expect(retried).resolves.toBe("background");
      expect(backgroundCallback).toHaveBeenCalledOnce();
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("rejects obsolete work after the pre-parse yield instead of decoding the old view", async () => {
    vi.useFakeTimers();
    const mounted = mount();
    try {
      const tile = buildTile(1);
      tile.engineData!.boundingVolume!.intersectsFrustum = () => true;
      const callback = vi.fn().mockResolvedValue("decoded");
      const result = mounted.renderer.parseQueue.add(tile, callback);
      const rejected = expect(result).rejects.toMatchObject({
        name: "AbortError",
      });
      mounted.renderer.parseQueue.tryRunJobs();
      tile.engineData!.boundingVolume!.intersectsFrustum = () => false;
      mounted.camera.position.x += 1;
      mounted.camera.updateMatrixWorld(true);
      mounted.runtime.scene.update(mounted.frame);
      await vi.advanceTimersByTimeAsync(50);
      await rejected;
      expect(callback).not.toHaveBeenCalled();
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("does not cancel at move start and waits for new-camera preparation", () => {
    const mounted = mount();
    const pending = buildTile(1);
    pending.internal.loadingState = 2;
    const disposed = vi.fn();
    mounted.renderer.loadingTiles.add(pending);
    mounted.renderer.lruCache.add(pending, disposed);
    mounted.setMoving(true);
    mounted.handlers.get(MAPLIBRE_EVENT.MOVE_START)?.();
    expect(disposed).not.toHaveBeenCalled();
    expect(mounted.map.triggerRepaint).toHaveBeenCalled();

    mounted.camera.position.x = 10;
    mounted.camera.updateMatrixWorld(true);
    mounted.runtime.scene.update(mounted.frame);
    expect(disposed).toHaveBeenCalledOnce();
    mounted.runtime.scene.dispose();
  });

  it("refines a covered viewport before the separate armed-floor audit finishes", () => {
    const root = buildTile(40);
    delete (root.engineData!.boundingVolume as { getAABB?: unknown }).getAABB;
    root.internal.loadingState = 4;
    (
      root.engineData!.boundingVolume as {
        intersectsFrustum: () => boolean;
      }
    ).intersectsFrustum = () => true;
    const mounted = mount();
    Object.assign(mounted.renderer, { rootTileset: { root } });
    mounted.renderer.visibleTiles.add(root);
    vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
      (_tile, target) =>
        Object.assign(target, {
          inView: true,
          error: 1,
          distanceFromCamera: 1,
        })
    );
    mounted.runtime.loading.setErrorTarget(1);
    mounted.camera.position.x = 1;
    mounted.camera.updateMatrixWorld(true);
    mounted.runtime.scene.update(mounted.frame);
    // Reserve is now armed by convergence, not eagerly from the metadata hint.
    // Its diagnostic audit is published on the following traversal.
    mounted.runtime.scene.update(mounted.frame);
    expect(mounted.runtime.loading.getCoverageStatus()).toMatchObject({
      floorArmed: true,
      effectiveErrorTarget: 1,
    });

    mounted.runtime.scene.update(mounted.frame);
    vi.spyOn(performance, "now").mockReturnValue(100_000);
    expect(mounted.runtime.loading.getCoverageStatus()).toMatchObject({
      floorArmed: true,
      effectiveErrorTarget: 1,
    });
    mounted.runtime.scene.dispose();
  });

  it.each([
    [32, false],
    [8, true],
  ] as const)(
    "arms reserve at initial quality, not idle quality (error=%s)",
    (error, floorArmed) => {
      const root = buildTile(0.1);
      const child = buildTile(0.05);
      (
        child.engineData!.boundingVolume as { intersectsFrustum: () => boolean }
      ).intersectsFrustum = () => true;
      root.children = [child];
      child.parent = root;
      root.internal.loadingState = 4;
      root.engineData!.scene = new THREE.Group();
      // Exercise the native-error fallback deterministically; this fixture does
      // not mount real ECEF bounds in the geographic scene transform.
      for (const tile of [root, child])
        delete (tile.engineData!.boundingVolume as { getAABB?: unknown })
          .getAABB;
      (
        root.engineData!.boundingVolume as { intersectsFrustum: () => boolean }
      ).intersectsFrustum = () => true;
      const mounted = mount();
      mounted.renderer.group.matrixWorld.identity();
      Object.assign(mounted.renderer, { rootTileset: { root } });
      mounted.renderer.visibleTiles.add(root);
      root.traversal.error = error;
      vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
        (_tile, target) =>
          Object.assign(target, { inView: true, error, distanceFromCamera: 1 })
      );
      mounted.runtime.loading.setErrorTarget(4);
      mounted.camera.position.set(0, 0, 10);
      mounted.camera.updateMatrixWorld(true);
      mounted.runtime.scene.update(mounted.frame);
      expect(mounted.runtime.loading.getCoverageStatus()).toMatchObject({
        floorArmed,
        effectiveErrorTarget: 16,
      });
      mounted.runtime.scene.dispose();
    }
  );

  it("restores a parked request when the pixel-error target changes", () => {
    const mounted = mount();
    const tile = buildTile(8);
    const root = buildTile(40);
    delete (root.engineData!.boundingVolume as { getAABB?: unknown }).getAABB;
    root.internal.loadingState = 4;
    (
      root.engineData!.boundingVolume as {
        intersectsFrustum: () => boolean;
      }
    ).intersectsFrustum = () => true;
    Object.assign(mounted.renderer, { rootTileset: { root } });
    mounted.renderer.visibleTiles.add(root);
    vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
      (_tile, target) =>
        Object.assign(target, {
          inView: true,
          error: 1,
          distanceFromCamera: 1,
        })
    );
    tile.internal.loadingState = -1;
    const states = (
      window as unknown as {
        __carmaTiles3d: Set<{
          layerId: string;
          deferred: Set<Tile>;
          requestedErrorTarget: number;
          effectiveErrorTarget: number;
          memoryErrorTarget: number;
          meshBaseCoverageReady: boolean;
          extentFloorArmed: boolean;
          extentFloorAuditPending: boolean;
          extentFloorPending: number;
        }>;
      }
    ).__carmaTiles3d;
    const state = [...states].find(
      (candidate) => candidate.layerId === mounted.layerId
    )!;
    state.deferred.add(tile);
    state.requestedErrorTarget = 1;
    state.effectiveErrorTarget = 16;
    state.memoryErrorTarget = 1;
    state.meshBaseCoverageReady = true;
    state.extentFloorArmed = true;
    state.extentFloorAuditPending = false;
    state.extentFloorPending = 0;
    mounted.runtime.scene.update(mounted.frame);
    expect(tile.internal.loadingState).toBe(0);
    expect(state.deferred.size).toBe(0);
    expect(state.effectiveErrorTarget).toBe(1);
    mounted.runtime.scene.dispose();
  });

  it("applies required memory coarsening before base and floor coverage recover", () => {
    const mounted = mount();
    const states = (
      window as unknown as {
        __carmaTiles3d: Set<{
          layerId: string;
          requestedErrorTarget: number;
          effectiveErrorTarget: number;
          memoryErrorTarget: number;
          meshBaseCoverageReady: boolean;
          extentFloorAuditPending: boolean;
          extentFloorPending: number;
          ceilingBytes: number;
        }>;
      }
    ).__carmaTiles3d;
    const state = [...states].find(
      (candidate) => candidate.layerId === mounted.layerId
    )!;
    state.requestedErrorTarget = 4;
    state.effectiveErrorTarget = 4;
    state.memoryErrorTarget = 20;
    state.meshBaseCoverageReady = false;
    state.extentFloorAuditPending = true;
    state.extentFloorPending = 3;
    Object.assign(mounted.renderer.lruCache, {
      cachedBytes: state.ceilingBytes,
    });
    vi.spyOn(mounted.renderer.lruCache, "isFull").mockReturnValue(true);

    mounted.runtime.scene.update(mounted.frame);

    expect(state.effectiveErrorTarget).toBe(20);
    mounted.runtime.scene.dispose();
  });

  it("wakes an idle pipeline at the memory relaxation deadline only once", () => {
    vi.useFakeTimers();
    let now = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const mounted = mount();
    try {
      const states = (
        window as unknown as {
          __carmaTiles3d: Set<{
            layerId: string;
            requestedErrorTarget: number;
            effectiveErrorTarget: number;
            memoryErrorTarget: number;
            memoryErrorTargetChangedAt: number;
            meshBaseCoverageReady: boolean;
            extentFloorAuditPending: boolean;
            extentFloorPending: number;
            ceilingBytes: number;
            errorTargetTimer: number;
          }>;
        }
      ).__carmaTiles3d;
      const state = [...states].find(
        (candidate) => candidate.layerId === mounted.layerId
      )!;
      state.requestedErrorTarget = 4;
      state.effectiveErrorTarget = 6;
      state.memoryErrorTarget = 6;
      state.memoryErrorTargetChangedAt = 0;
      state.meshBaseCoverageReady = true;
      state.extentFloorAuditPending = false;
      state.extentFloorPending = 0;
      Object.assign(mounted.renderer.lruCache, {
        cachedBytes: state.ceilingBytes * 0.5,
      });
      vi.spyOn(mounted.renderer.lruCache, "isFull").mockReturnValue(false);

      mounted.runtime.scene.update(mounted.frame);
      expect(state.errorTargetTimer).not.toBe(0);
      vi.advanceTimersByTime(5_000);
      expect(state.errorTargetTimer).not.toBe(0);
      now = 6_001;
      vi.advanceTimersByTime(1);
      expect(state.errorTargetTimer).toBe(0);

      mounted.runtime.scene.update(mounted.frame);
      expect(state.memoryErrorTarget).toBe(4);
      // This fixture has no root/cut: relaxed memory pressure must not bypass
      // bootstrap. The memory timer itself must still wake exactly once.
      expect(state.effectiveErrorTarget).toBe(16);
      expect(state.errorTargetTimer).toBe(0);
    } finally {
      mounted.runtime.scene.dispose();
      vi.useRealTimers();
    }
  });

  it("preserves floor accounting when the vendor skips traversal and replaces it after a real traversal", () => {
    let traverses = true;
    const mounted = mount(
      () => undefined,
      () => traverses
    );
    const floor = buildTile(40);
    const states = (
      window as unknown as {
        __carmaTiles3d: Set<{
          layerId: string;
          extentFloorArmed: boolean;
          extentFloorAuditPending: boolean;
          extentFloorPending: number;
          extentFloorInView: Set<Tile>;
        }>;
      }
    ).__carmaTiles3d;
    const state = [...states].find(
      (candidate) => candidate.layerId === mounted.layerId
    )!;
    state.extentFloorArmed = true;
    state.extentFloorAuditPending = true;
    state.extentFloorPending = 3;
    state.extentFloorInView.add(floor);

    traverses = false;
    mounted.runtime.scene.update(mounted.frame);
    expect(state.extentFloorPending).toBe(3);
    expect(state.extentFloorInView).toEqual(new Set([floor]));
    expect(state.extentFloorAuditPending).toBe(true);

    traverses = true;
    mounted.runtime.scene.update(mounted.frame);
    expect(state.extentFloorPending).toBe(0);
    expect(state.extentFloorInView.size).toBe(0);
    expect(state.extentFloorAuditPending).toBe(false);
    mounted.runtime.scene.dispose();
  });
});
