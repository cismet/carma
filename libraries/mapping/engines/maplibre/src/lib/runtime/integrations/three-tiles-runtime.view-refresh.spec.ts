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
import type {
  RuntimeTile,
  ThreeTilesRuntimeOptions,
} from "./three-tiles-runtime-types";
import { tilesQueuePriorityCallback } from "./three-tiles-runtime-vendor";
import { buildThreeTilesRuntime } from "./three-tiles-runtime";
import type { ThreeTilesRuntimeState } from "./three-tiles-runtime-context";

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
  providesTerrain = true,
  options: Partial<ThreeTilesRuntimeOptions> = {}
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
    ...options,
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
  const state = runtime.debug.readState() as ThreeTilesRuntimeState;
  return { ...host, runtime, renderer, camera, frame, layerId, state };
};

const mockTileViews = (
  renderer: TestRenderer,
  tiles: readonly Tile[],
  inView: (tile: Tile) => boolean = () => true
) => {
  for (const tile of tiles) {
    delete (tile.engineData!.boundingVolume as { getAABB?: unknown }).getAABB;
    tile.engineData!.boundingVolume!.intersectsFrustum = () => inView(tile);
  }
  vi.spyOn(renderer, "calculateTileViewError").mockImplementation(
    (tile, target) =>
      Object.assign(target, {
        inView: inView(tile),
        error: tile.geometricError,
        distanceFromCamera: 1,
      })
  );
};

const finishMove = (mounted: ReturnType<typeof mount>) => {
  mounted.setMoving(false);
  mounted.handlers.get(MAPLIBRE_EVENT.MOVE_END)?.();
  for (let frame = 0; frame < 3; frame++)
    mounted.runtime.scene.update(mounted.frame);
};

describe("three tiles current-view refresh", () => {
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

  it.each([0, 1, 2])(
    "bounds stationary discovery with %i prefetched levels and keeps motion at one",
    (levels) => {
      prefetchPolicy.levels = levels;
      const mounted = mount();
      try {
        const state = mounted.state;
        const chain = [1600, 800, 400, 200, 100].map((error) =>
          buildTile(error)
        );
        for (let i = 0; i < chain.length; i++) {
          if (i) {
            chain[i].parent = chain[i - 1];
            chain[i - 1].children = [chain[i]];
          }
          delete (chain[i].engineData!.boundingVolume as { getAABB?: unknown })
            .getAABB;
        }
        chain[0].internal.loadingState = 4;
        state.displayedMeshFrontier.add(chain[0]);
        vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
          (tile, target) => {
            Object.assign(target, {
              inView: true,
              error: tile.geometricError,
              distanceFromCamera: 1,
            });
          }
        );
        for (const moving of [false, true]) {
          mounted.setMoving(moving);
          const boundary = moving ? 1 : 1 + levels;
          for (let depth = 1; depth < chain.length; depth++) {
            const target = { inView: false, error: 0, distanceFromCamera: 0 };
            mounted.renderer.calculateTileViewErrorWithPlugin(
              chain[depth],
              target
            );
            expect(target.error).toBe(
              depth === boundary
                ? state.effectiveErrorTarget
                : chain[depth].geometricError
            );
          }
        }
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it.each([
    [1, "download"],
    [1, "parse"],
    [2, "download"],
    [2, "parse"],
  ] as const)(
    "starts %i levels of lookahead %s before pending parents, below coverage-repair priority",
    async (levels, phase) => {
      prefetchPolicy.levels = levels;
      vi.useFakeTimers();
      const mounted = mount();
      try {
        const state = mounted.state;
        state.effectiveErrorTarget = 6;
        state.requestedErrorTarget = 6;
        state.memoryErrorTarget = 6;
        // Synthetic visible demand: the pending parent's 12px error is above
        // final quality but below the 16px bootstrap gate being bypassed.
        state.tileCameraDemand = {
          ...state.tileCameraDemand,
          evaluate: () => ({
            required: true,
            receiver: true,
            errorRatio: 2,
            priority: TILE_CAMERA_PRIORITY.PRIMARY,
          }),
        } as typeof state.tileCameraDemand;
        mounted.renderer.loadAncestors = true;
        const root = buildTile(40);
        const parent = buildTile(12);
        const route = buildTile(12);
        route.internal.hasRenderableContent = false;
        route.internal.hasUnrenderableContent = true;
        const child = buildTile(6);
        const sibling = buildTile(6);
        const second = buildTile(3);
        child.children = [second];
        second.parent = child;
        root.internal.loadingState = 4;
        parent.internal.loadingState = 2;
        root.children = [parent];
        parent.parent = root;
        parent.children = [route];
        route.parent = parent;
        route.children = [child, sibling];
        child.parent = sibling.parent = route;
        for (const tile of [root, parent, route, child, sibling, second]) {
          tile.internal.renderer = mounted.renderer;
          tile.engineData!.boundingVolume!.intersectsFrustum = () => true;
        }
        state.displayedMeshFrontier.add(root);
        state.meshRefinementSupport.add(parent);
        mounted.renderer.queueTileForDownload(route);
        expect(mounted.renderer.queuedTiles).toEqual([route]);
        if (levels === 2) {
          // Native skip traversal would request only the deepest leaf. The
          // preceding discovery callback must also enqueue this intermediate.
          vi.spyOn(
            mounted.renderer,
            "calculateTileViewError"
          ).mockImplementation((tile, target) => {
            Object.assign(target, {
              inView: true,
              error: tile.geometricError,
              distanceFromCamera: 1,
            });
          });
          mounted.renderer.calculateTileViewErrorWithPlugin(child, {
            inView: false,
            error: 0,
            distanceFromCamera: 0,
          });
          expect(mounted.renderer.queuedTiles).toContain(child);
        }
        for (const candidate of [child, second].slice(0, levels)) {
          mounted.renderer.queueTileForDownload(candidate);
          expect(mounted.renderer.queuedTiles).toContain(candidate);
          expect(mounted.renderer.queuedTiles).not.toContain(sibling);
          expect(state.meshRefinementSupport.has(candidate)).toBe(false);
          const callback = vi.fn().mockResolvedValue("ready");
          const result =
            phase === "download"
              ? mounted.renderer.downloadQueue.add(
                  "https://example.test/child",
                  candidate,
                  callback
                )
              : mounted.renderer.parseQueue.add(candidate, callback);
          await vi.advanceTimersByTimeAsync(50);
          expect(callback).toHaveBeenCalledOnce();
          await expect(result).resolves.toBe("ready");
          expect((candidate as RuntimeTile).cameraPriority).toBe(
            TILE_CAMERA_PRIORITY.PRIMARY
          );
        }
        expect(parent.internal.loadingState).toBe(2);
        expect(child.internal.loadingState).toBe(0);
        expect(state.displayedMeshFrontier).toEqual(new Set([root]));

        // Existing backpressure still rejects new native requests.
        mounted.renderer.queuedTiles.length = 0;
        state.queuedThisTraversal.clear();
        state.memoryAdmissionPaused = true;
        mounted.renderer.queueTileForDownload(child);
        expect(mounted.renderer.queuedTiles).toEqual([]);
        state.memoryAdmissionPaused = false;
        state.loadingPaused = true;
        mounted.renderer.queueTileForDownload(child);
        expect(mounted.renderer.queuedTiles).toEqual([]);
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

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

  it("schedules raw replacement siblings through their known hierarchy parent", () => {
    const mounted = mount();
    try {
      const state = mounted.state;
      state.meshInitialBasePassDone = true;
      mounted.runtime.loading.setErrorTargetOverride(4);
      const parent = buildTile(40);
      parent.internal.loadingState = 4;
      parent.engineData!.scene = new THREE.Group();
      parent.engineData!.boundingVolume!.intersectsFrustum = () => true;
      delete (parent.engineData!.boundingVolume as { getAABB?: unknown })
        .getAABB;
      // Native preprocessing is what establishes a child's parent pointer.
      const child = { children: [], geometricError: 4 } as unknown as Tile;
      parent.children = [child];
      Object.assign(mounted.renderer, { rootTileset: { root: parent } });
      const prepare = vi
        .spyOn(mounted.renderer, "ensureChildrenArePreprocessed")
        .mockImplementation(() => undefined);
      vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
        (tile, target) =>
          Object.assign(target, {
            inView: true,
            error: tile.geometricError,
            distanceFromCamera: 1,
          })
      );
      mounted.runtime.scene.update(mounted.frame);
      expect(mounted.renderer.visibleTiles.has(parent)).toBe(true);
      // First publish the admissible 40px surface; the next refinement pass
      // must initialize its raw replacement topology without losing coverage.
      mounted.renderer.dispatchEvent({ type: "needs-update" });
      mounted.runtime.scene.update(mounted.frame);
      expect(mounted.renderer.visibleTiles.has(parent)).toBe(true);
      expect(prepare).toHaveBeenCalledWith(parent, false);
      Object.assign(child, buildTile(4), { parent });
      child.internal.loadingState = 4;
      child.engineData!.scene = new THREE.Group();
      child.engineData!.boundingVolume!.intersectsFrustum = () => true;
      delete (child.engineData!.boundingVolume as { getAABB?: unknown })
        .getAABB;
      mounted.renderer.dispatchEvent({ type: "needs-update" });
      mounted.runtime.scene.update(mounted.frame);
      expect(mounted.renderer.visibleTiles.has(child)).toBe(true);
      expect(mounted.renderer.visibleTiles.has(parent)).toBe(false);
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("keeps unconfigured cold startup in skip mode through motion and handover", () => {
    const ancestorPasses: boolean[] = [];
    const mounted = mount((renderer) =>
      ancestorPasses.push(renderer.loadAncestors)
    );
    try {
      expect(ancestorPasses).toEqual([false]);
      mounted.setMoving(true);
      mounted.runtime.scene.update(mounted.frame);
      expect(ancestorPasses).toEqual([false, false]);
      const state = mounted.state;
      state.meshInitialHandoverDone = true;
      state.displayedMeshFrontier.add(buildTile(20));
      mounted.runtime.scene.update(mounted.frame);
      expect(ancestorPasses).toEqual([false, false, false]);
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it.each(
    [false, true].flatMap((shadows) =>
      [false, true].map((moving) => ({ shadows, moving }))
    )
  )(
    "recovers viewport holes before refinement after handover: %j",
    ({ shadows, moving }) => {
      const admitted: Tile[] = [];
      vi.spyOn(
        TilesRenderer.prototype,
        "queueTileForDownload"
      ).mockImplementation(function (this: TilesRenderer, tile) {
        if (this.lruCache.isFull()) return;
        admitted.push(tile);
        tile.internal.loadingState = 1;
      });
      const mounted = mount();
      try {
        const state = mounted.state;
        const root = buildTile(200);
        Object.assign(root.internal, {
          hasContent: false,
          hasRenderableContent: false,
        });
        const covered = buildTile(8);
        const refinement = buildTile(2);
        covered.children = [refinement];
        refinement.parent = covered;
        const missing = buildTile(40);
        const missingDetail = buildTile(2);
        missing.children = [missingDetail];
        missingDetail.parent = missing;
        const outside = buildTile(40);
        root.children = [covered, missing, outside];
        for (const tile of root.children) tile.parent = root;
        let expanded = false;
        mockTileViews(
          mounted.renderer,
          [root, covered, refinement, missing, missingDetail, outside],
          (tile) => tile !== outside && (tile !== missing || expanded)
        );
        covered.internal.loadingState = 4;
        covered.engineData!.scene = new THREE.Group();
        Object.assign(mounted.renderer, { rootTileset: { root } });
        vi.spyOn(mounted.renderer, "getBoundingBox").mockImplementation(
          (box) => {
            box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
            return true;
          }
        );
        vi.spyOn(
          mounted.renderer,
          "ensureChildrenArePreprocessed"
        ).mockImplementation(() => undefined);

        state.requestedErrorTarget =
          state.effectiveErrorTarget =
          state.memoryErrorTarget =
            4;
        mounted.renderer.errorTarget = 4;
        state.meshInitialBasePassDone = state.meshInitialHandoverDone = true;
        state.displayedMeshFrontier = new Set([covered]);
        if (shadows)
          state.shadowView = {
            camera: new THREE.OrthographicCamera(),
            shadowMapSize: { width: 1024, height: 1024 },
          };
        mounted.runtime.scene.update(mounted.frame);
        // Failing the 4px quality goal alone is not a coverage hole.
        expect(state.meshCoverageRecovery).toBe(false);
        admitted.length = 0;
        refinement.internal.loadingState = 0;
        expanded = true;
        mounted.setMoving(moving);
        mounted.camera.position.x += 1;
        mounted.camera.updateMatrixWorld(true);
        mounted.runtime.scene.update(mounted.frame);
        expect(state.meshCoverageRecovery).toBe(true);
        expect(state.meshInitialHandoverDone).toBe(true);
        expect(state.displayedMeshFrontier.has(covered)).toBe(true);
        // Native admission rejects missing coverage before it becomes QUEUED.
        // Pending background bytes must yield without evicting ready coverage.
        const cache = mounted.renderer.lruCache;
        const beforeBytes = cache.cachedBytes;
        const queued = buildTile(8);
        const downloading = buildTile(8);
        const untouched = buildTile(8);
        const parsing = buildTile(8);
        const metadata = buildTile(8);
        const committed = buildTile(8);
        const visible = buildTile(8);
        const loaded = buildTile(8);
        const protectedTiles = [
          parsing,
          metadata,
          committed,
          visible,
          loaded,
          missingDetail,
        ];
        const fixtures = [downloading, queued, untouched, ...protectedTiles];
        const removed: Tile[] = [];
        for (const tile of fixtures) {
          if (tile !== missingDetail) tile.parent = covered;
          tile.internal.loadingState =
            tile === queued || tile === missingDetail
              ? 1
              : tile === parsing
              ? 3
              : tile === loaded
              ? 4
              : 2;
          if (tile === metadata) tile.internal.hasUnrenderableContent = true;
          cache.add(tile, () => {
            removed.push(tile);
            mounted.renderer.loadingTiles.delete(tile);
          });
          cache.setMemoryUsage(
            tile,
            tile === queued
              ? 20
              : tile === downloading || tile === untouched
              ? 40
              : 5
          );
          if (tile !== loaded) mounted.renderer.loadingTiles.add(tile);
        }
        state.committedMeshCasterFrontier.add(committed);
        mounted.renderer.visibleTiles.add(visible);
        const full = vi
          .spyOn(cache, "isFull")
          .mockImplementation(() => cache.cachedBytes >= beforeBytes + 100);
        expect(cache.isFull()).toBe(true);
        mounted.renderer.queueTileForDownload(refinement);
        expect(removed).toEqual([]);
        mounted.renderer.queueTileForDownload(missing);
        expect(removed).toEqual([queued, downloading]);
        expect(cache.isFull()).toBe(false);
        for (const tile of [...protectedTiles, untouched])
          expect(cache.has(tile)).toBe(true);
        full.mockRestore();
        for (const tile of fixtures) cache.remove(tile);
        state.committedMeshCasterFrontier.delete(committed);
        mounted.renderer.visibleTiles.delete(visible);
        missingDetail.internal.loadingState = 0;
        mounted.renderer.queueTileForDownload(outside);
        expect(admitted).toContain(missing);
        expect(admitted).not.toContain(refinement);
        expect(admitted).not.toContain(outside);
        expect((missing as RuntimeTile).cameraPriority).toBe(
          TILE_CAMERA_PRIORITY.VIEWPORT_FILL
        );
        // A coarse arriving surface closes the gap immediately, without waiting
        // for idle quality, shadow casters, or the out-of-view sibling.
        missing.internal.loadingState = 4;
        missing.engineData!.scene = new THREE.Group();
        mounted.runtime.scene.update(mounted.frame);
        expect(state.displayedMeshFrontier).toEqual(
          new Set([covered, missing])
        );
        expect(state.meshCoverageRecovery).toBe(false);
        finishMove(mounted);
        mounted.renderer.queueTileForDownload(refinement);
        expect(admitted).toContain(refinement);
        expect(state.effectiveErrorTarget).toBe(4);
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

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

  it.each([16, undefined])(
    "disables native ancestor sibling expansion during configured cold fill (base %s)",
    (baseErrorTargetPixels) => {
      const passes: boolean[] = [];
      const mounted = mount(
        (renderer) => passes.push(renderer.loadAncestors),
        () => true,
        true,
        { baseErrorTargetPixels, handoverErrorTargetPixels: 8 }
      );
      try {
        expect(passes).toEqual([false]);
        expect(mounted.renderer.loadSiblings).toBe(false);
        const state = mounted.state;
        state.meshInitialHandoverDone = true;
        state.displayedMeshFrontier.add(buildTile(6));
        mounted.runtime.scene.update(mounted.frame);
        expect(passes).toEqual([false, baseErrorTargetPixels === undefined]);
        expect(mounted.renderer.loadSiblings).toBe(false);
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it("requests visible and unknown cold siblings, without adding proven offscreen support", () => {
    const admitted: Tile[] = [];
    vi.spyOn(
      TilesRenderer.prototype,
      "queueTileForDownload"
    ).mockImplementation((tile) => {
      admitted.push(tile);
      tile.internal.loadingState = 1;
    });
    const mounted = mount(undefined, undefined, true, {
      handoverErrorTargetPixels: 8,
    });
    try {
      const state = mounted.state;
      const parent = buildTile(40);
      parent.internal.loadingState = 4;
      const children = Array.from({ length: 4 }, () => buildTile(6));
      parent.children = children;
      for (const child of children) child.parent = parent;
      children[0].engineData!.boundingVolume!.intersectsFrustum = () => true;
      children[1].engineData!.boundingVolume!.intersectsFrustum = () => true;
      delete (children[2] as RuntimeTile).engineData!.boundingVolume;
      for (const tile of [parent, children[0], children[1], children[3]])
        delete (tile.engineData!.boundingVolume as { getAABB?: unknown })
          .getAABB;
      vi.spyOn(
        mounted.renderer,
        "ensureChildrenArePreprocessed"
      ).mockImplementation(() => undefined);
      vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
        (tile, target) =>
          Object.assign(target, {
            inView: tile !== children[3],
            error: tile.geometricError,
            distanceFromCamera: 1,
          })
      );
      state.displayedMeshFrontier = new Set([parent]);
      state.requestedErrorTarget = 4;
      state.effectiveErrorTarget = 8;
      state.memoryErrorTarget = 4;
      mounted.renderer.queueTileForDownload(children[0]);
      expect(new Set(admitted)).toEqual(new Set(children.slice(0, 3)));
      expect(state.meshRefinementSupport).toEqual(
        new Set(children.slice(0, 3))
      );
      expect(children[3].internal.loadingState).toBe(0);
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
      const state = mounted.state;
      // Normal coverage starts only after the first observer idle.
      state.meshInitialHandoverDone = true;
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

  it.each(
    [
      { published: true, parentError: 8, memoryTarget: 4, keepChildren: true },
      { published: true, parentError: 8, memoryTarget: 12, keepChildren: true },
      {
        published: true,
        parentError: 8,
        memoryTarget: 4,
        keepChildren: true,
        previousCount: 1,
      },
      { published: true, parentError: 3, memoryTarget: 4, keepChildren: true },
      {
        published: false,
        parentError: 8,
        memoryTarget: 4,
        keepChildren: false,
      },
    ].flatMap((scenario) =>
      [false, true].map((shadows) => ({
        ...scenario,
        shadows,
        // Shadow bootstrap may reuse already-ready fine children immediately.
        keepChildren: scenario.keepChildren || (!scenario.published && shadows),
      }))
    )
  )(
    "separates motion admission from idle-detail retention: %j",
    ({
      published,
      shadows,
      parentError,
      memoryTarget,
      keepChildren,
      previousCount = 4,
    }) => {
      const mounted = mount();
      try {
        const state = mounted.state;
        const parent = buildTile(parentError);
        const children = Array.from({ length: 4 }, () => buildTile(2));
        parent.children = children;
        for (const child of children) child.parent = parent;
        for (const tile of [parent, ...children]) {
          tile.internal.loadingState = 4;
          tile.engineData!.scene = new THREE.Group();
        }
        Object.assign(mounted.renderer, { rootTileset: { root: parent } });
        mockTileViews(mounted.renderer, [parent, ...children]);
        state.requestedErrorTarget = 4;
        state.effectiveErrorTarget = 12;
        state.memoryErrorTarget = memoryTarget;
        mounted.renderer.errorTarget = 12;
        state.displayedMeshFrontier = new Set(
          published ? children.slice(0, previousCount) : []
        );
        if (shadows) {
          state.shadowView = {
            camera: new THREE.OrthographicCamera(),
            shadowMapSize: { width: 1024, height: 1024 },
          };
          state.committedMeshReceiverFrontier = new Set(
            state.displayedMeshFrontier
          );
        }
        mounted.setMoving(true);
        mounted.camera.position.x += 1;
        mounted.camera.updateMatrixWorld(true);
        mounted.runtime.scene.update(mounted.frame);
        expect(state.displayedMeshFrontier).toEqual(
          new Set(keepChildren ? children : [parent])
        );
        // Motion only relaxes new demand. At rest the normal target can
        // coarsen a zoomed-out family again or refine newly filled coverage.
        if (memoryTarget === 4) {
          state.meshInitialBasePassDone = true;
          state.meshInitialHandoverDone = true;
          finishMove(mounted);
          expect(state.effectiveErrorTarget).toBe(4);
          expect(state.displayedMeshFrontier).toEqual(
            new Set(parentError <= 4 ? [parent] : children)
          );
        }
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it.each(
    [false, true].flatMap((shadows) =>
      [2, -1].map((loadingState) => ({ shadows, loadingState }))
    )
  )(
    "keeps complete colour coverage on pan with shadows=$shadows and sibling state=$loadingState",
    ({ shadows, loadingState }) => {
      const mounted = mount();
      try {
        const state = mounted.state;
        const parent = buildTile(80);
        const children = Array.from({ length: 4 }, () => buildTile(2));
        parent.children = children;
        for (const child of children) child.parent = parent;
        for (const tile of [parent, ...children]) {
          tile.internal.loadingState = 4;
          const scene = new THREE.Group();
          scene.add(
            new THREE.Mesh(
              new THREE.BufferGeometry(),
              new THREE.MeshBasicMaterial()
            )
          );
          tile.engineData!.scene = scene;
          tile.engineData!.boundingVolume!.intersectsFrustum = () => true;
          delete (tile.engineData!.boundingVolume as { getAABB?: unknown })
            .getAABB;
        }
        children[3].internal.loadingState = loadingState;
        // This fixture uses the explicit camera-error adapter, without root bounds.
        vi.spyOn(mounted.renderer, "getBoundingBox").mockReturnValue(false);
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
        state.effectiveErrorTarget = 4;
        state.memoryErrorTarget = 4;
        state.displayedMeshFrontier = new Set(children.slice(0, 3));
        if (shadows) {
          state.shadowView = {
            camera: new THREE.OrthographicCamera(),
            shadowMapSize: { width: 1024, height: 1024 },
          };
          state.committedMeshReceiverFrontier = new Set(children.slice(0, 3));
          state.committedMeshCasterFrontier = new Set(children.slice(0, 3));
        }
        for (const tile of children.slice(0, 3)) {
          mounted.renderer.setTileActive(tile, true);
          mounted.renderer.setTileVisible(tile, true);
        }
        mounted.setMoving(true);
        mounted.camera.position.x += 1;
        mounted.camera.updateMatrixWorld(true);
        mounted.runtime.scene.update(mounted.frame);
        expect(state.displayedMeshFrontier).toEqual(new Set([parent]));
        if (shadows)
          expect(state.committedMeshReceiverFrontier).toEqual(
            new Set([parent])
          );
        const colourCut = () =>
          new Set(
            [...mounted.renderer.visibleTiles].filter((tile) => {
              const scene = tile.engineData!.scene!;
              return (
                scene.parent === mounted.renderer.group &&
                mounted.renderer.group.children.includes(scene) &&
                (
                  scene.children[0] as THREE.Mesh<
                    THREE.BufferGeometry,
                    THREE.MeshBasicMaterial
                  >
                ).material.colorWrite
              );
            })
          );
        expect(colourCut()).toEqual(new Set([parent]));
        // The complete replacement can publish after the last payload arrives.
        children[3].internal.loadingState = 4;
        state.meshContentRevision++;
        mounted.runtime.scene.update(mounted.frame);
        expect(state.displayedMeshFrontier).toEqual(new Set(children));
        expect(colourCut()).toEqual(new Set(children));
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
  afterEach(() => {
    prefetchPolicy.levels = 1;
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
        const state = mounted.state;
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
        const state = mounted.state;
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
        state.meshCoverageRecovery = true;
        mounted.renderer.loadingTiles.delete(visible);
        finish("visible");
        await expect(visiblePromise).resolves.toBe("visible");
        await vi.advanceTimersByTimeAsync(50);
        // Recovery cannot fall through to idle reserve downloads when no
        // finite-rank payload is queued. Decoded buffers keep progressing.
        expect(floorJob).toHaveBeenCalledTimes(phase === "parse" ? 1 : 0);
        state.meshCoverageRecovery = false;
        if (phase === "parse") mounted.renderer.parseQueue.tryRunJobs();
        else
          for (const queue of mounted.renderer.downloadQueue.originQueues.values())
            queue.tryRunJobs();
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
      const state = mounted.state;
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
      const state = mounted.state;
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
      const state = mounted.state;
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

  it("refines after observer handover while extent reserve coverage is still pending", () => {
    const mounted = mount(
      () => undefined,
      () => false
    );
    const state = mounted.state;
    const parent = buildTile(8);
    parent.internal.loadingState = 4;
    Object.assign(parent.engineData, { scene: new THREE.Group() });
    vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
      (_tile, target) =>
        Object.assign(target, { inView: true, error: 8, distanceFromCamera: 1 })
    );
    Object.assign(mounted.renderer, { rootTileset: { root: parent } });
    mounted.renderer.visibleTiles.add(parent);
    state.displayedMeshFrontier.add(parent);
    state.requestedErrorTarget = 6;
    state.memoryErrorTarget = 6;
    state.effectiveErrorTarget = 16;
    state.meshInitialBasePassDone = true;
    state.meshInitialHandoverDone = false;
    state.extentFloorArmed = true;
    state.extentFloorAuditPending = true;
    state.extentFloorPending = 3;

    mounted.runtime.scene.update(mounted.frame);

    expect(state.meshInitialHandoverDone).toBe(true);
    expect(state.meshInitialReserveSettled).toBe(false);
    expect(state.extentFloorPending).toBe(3);
    expect(state.effectiveErrorTarget).toBe(6);
    expect(state.displayedMeshFrontier.has(parent)).toBe(true);
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
