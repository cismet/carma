// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";

import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_PRIORITY,
  TILE_CAMERA_ROLE,
  TILE_MAIN_OBSERVER_ID,
} from "../../core/tile-camera-demand";
import type { RuntimeTile } from "./three-tiles-runtime-types";
import {
  tilesNodeQueuePriorityCallback,
  tilesQueuePriorityCallback,
} from "./three-tiles-runtime-vendor";

import {
  buildTile,
  mount,
} from "./three-tiles-runtime.view-refresh.test-support";
const prefetchPolicy = vi.hoisted(() => ({ levels: 1 }));

vi.mock("./three-tiles-runtime-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./three-tiles-runtime-config")>()),
  get MESH_REFINEMENT_PREFETCH_LEVELS() {
    return prefetchPolicy.levels;
  },
}));

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

describe("camera runtime integration", () => {
  afterEach(() => {
    prefetchPolicy.levels = 1;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  it("keeps mesh selection error and native traversal resolution invariant across DPR", () => {
    const mounted = mount();
    const resolution = vi.spyOn(mounted.renderer, "setResolution");
    const bounds = new THREE.Box3(
      new THREE.Vector3(-1, -1, -11),
      new THREE.Vector3(1, 1, -9)
    );
    try {
      const errors: number[] = [];
      for (const dpr of [1, 1.25, 2, 3]) {
        mounted.runtime.scene.update({
          ...mounted.frame,
          viewport: new THREE.Vector2(800 * dpr, 600 * dpr),
          cssViewport: new THREE.Vector2(800, 600),
        });
        const state = mounted.state;
        const observer = state.tileCameraDemand.views.find(
          (view) => view.id === TILE_MAIN_OBSERVER_ID
        )!;
        const demand = createTileCameraDemand([observer]).evaluate(bounds, 1);
        expect(demand.required).toBe(true);
        errors.push(demand.errorRatio * observer.errorTargetPixels);
        expect(resolution).toHaveBeenLastCalledWith(mounted.camera, 800, 600);
      }
      expect(errors[0]).toBeGreaterThan(0);
      for (const error of errors) expect(error).toBeCloseTo(errors[0], 10);
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it.each(["perspective", "padded", "orthographic"] as const)(
    "uses clipped visible-depth SSE for native traversal too (%s)",
    (projection) => {
      const mounted = mount();
      try {
        const state = mounted.state;
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
          tile.engineData!.boundingVolume!.intersectsFrustum = () => true;
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
        // A conservative broad-phase hit is not observer demand when clipped
        // bounds miss. Publication must not wait on this unrequestable branch.
        const phantom = buildTile(1);
        phantom.engineData!.boundingVolume!.intersectsFrustum = () => true;
        phantom.engineData!.boundingVolume!.getAABB = (box) =>
          box.set(
            new THREE.Vector3(10000, 10000, -10),
            new THREE.Vector3(10001, 10001, -9)
          );
        const target = { inView: true, error: 10000, distanceFromCamera: 1 };
        mounted.renderer.calculateTileViewErrorWithPlugin(phantom, target);
        expect(target.inView).toBe(false);
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
        const state = mounted.state;
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

  it("orders camera demand and visible benefit before native ties without changing cache ordering", () => {
    const low = buildTile() as RuntimeTile;
    const high = buildTile() as RuntimeTile;
    low.priority = 1000;
    high.priority = 1;
    low.cameraPriority = TILE_CAMERA_PRIORITY.SECONDARY;
    high.cameraPriority = TILE_CAMERA_PRIORITY.FOCUS;
    expect(tilesQueuePriorityCallback(high, low)).toBeGreaterThan(0);
    high.cameraPriority = TILE_CAMERA_PRIORITY.SECONDARY;
    expect(tilesQueuePriorityCallback(low, high)).toBeGreaterThan(0);
    high.meshRefinement = {
      group: high,
      currentErrorPixels: 96,
      nextErrorPixels: 24,
      visibleAreaPixels: 1000,
      benefit: 72000,
      provisional: false,
    };
    low.meshRefinement = { ...high.meshRefinement, group: low, benefit: 4000 };
    expect(tilesQueuePriorityCallback(high, low)).toBeGreaterThan(0);
    // Native node jobs are the owners of uninitialized children, not the raw
    // children. Their own family gain must survive even with the same parent.
    expect(tilesNodeQueuePriorityCallback(high, low)).toBeGreaterThan(0);
    expect(tilesQueuePriorityCallback(low, high, false)).toBeGreaterThan(0);
    low.meshRefinement = high.meshRefinement;
    expect(tilesQueuePriorityCallback(low, high)).toBeGreaterThan(0);
    // Mixed scored/unscored jobs must not choose an opponent-dependent key:
    // A owns rank1, B inherits rank4 despite own rank1, C inherits rank2.
    const [a, b, c, bParent, cParent] = Array.from(
      { length: 5 },
      () => buildTile() as RuntimeTile
    );
    a.cameraPriority = b.cameraPriority = TILE_CAMERA_PRIORITY.PRIMARY;
    c.cameraPriority = cParent.cameraPriority = TILE_CAMERA_PRIORITY.FOCUS;
    bParent.cameraPriority = TILE_CAMERA_PRIORITY.VIEWPORT_FILL;
    a.meshRefinement = { ...high.meshRefinement, group: a };
    b.parent = bParent;
    c.parent = cParent;
    for (const [before, after] of [
      [a, c],
      [c, b],
      [a, b],
    ]) {
      expect(tilesNodeQueuePriorityCallback(before, after)).toBeLessThan(0);
      expect(tilesNodeQueuePriorityCallback(after, before)).toBeGreaterThan(0);
    }
  });
});
