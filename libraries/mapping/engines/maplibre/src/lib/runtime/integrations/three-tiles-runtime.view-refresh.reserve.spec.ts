// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";

import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("reserve runtime integration", () => {
  afterEach(() => {
    prefetchPolicy.levels = 1;
    vi.restoreAllMocks();
    vi.useRealTimers();
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
    // First observer idle releases final quality and arms background reserve.
    mounted.runtime.scene.update(mounted.frame);
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
        floorArmed: false,
        // A ready base cut releases final quality in this same frame.
        effectiveErrorTarget: floorArmed ? 4 : 64,
      });
      mounted.runtime.scene.update(mounted.frame);
      // The completed visible cut releases normal mode; the requested next
      // traversal admits the reserve instead of delaying that visible cut.
      mounted.runtime.scene.update(mounted.frame);
      // Coverage diagnostics sample at most twice a second.
      const afterTransition = performance.now() + 501;
      vi.spyOn(performance, "now").mockReturnValue(afterTransition);
      expect(mounted.runtime.loading.getCoverageStatus()).toMatchObject({
        floorArmed,
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
    const state = mounted.state;
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
    const state = mounted.state;
    state.meshInitialBasePassDone = true;
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
      const state = mounted.state;
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
      expect(state.effectiveErrorTarget).toBe(64);
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
    const state = mounted.state;
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
