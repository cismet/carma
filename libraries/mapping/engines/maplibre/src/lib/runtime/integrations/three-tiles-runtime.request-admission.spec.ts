// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import { PriorityQueue, type Tile } from "3d-tiles-renderer/core";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import { buildThreeTilesRuntime } from "./three-tiles-runtime";

import { MESH_EVICTION_BATCH_SIZE } from "./three-tiles-runtime-config";
const MIB = 1024 ** 2;

type BytesRenderer = {
  calculateBytesUsed: (tile: unknown, scene: THREE.Object3D | null) => number;
};

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

describe("request admission runtime integration", () => {
  it("rejects stale offscreen support and admits current-view prerequisites through pause gates", () => {
    type QueueRenderer = TilesRenderer & {
      queueTileForDownload: (tile: Tile) => void;
    };
    const nativeQueue = vi
      .spyOn(TilesRenderer.prototype as QueueRenderer, "queueTileForDownload")
      .mockImplementation(() => undefined);
    let renderer!: QueueRenderer;
    const update = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function () {
        renderer = this as QueueRenderer;
      });
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
      isMoving: () => false,
    } as unknown as MaplibreMap;
    const runtime = buildThreeTilesRuntime(
      "support-admission",
      "mesh.json",
      [7.2, 51.2],
      { providesTerrain: true, diagnostics: true }
    );
    const camera = new THREE.PerspectiveCamera();
    const frame = {
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    };
    const parent = {
      parent: null,
      children: [],
      geometricError: 40,
      refine: "REPLACE",
      internal: { hasRenderableContent: true, loadingState: 4 },
      traversal: { error: 1, inFrustum: false },
    } as unknown as Tile;
    const support = {
      content: { uri: "support.b3dm" },
      parent,
      children: [],
      geometricError: 10,
      refine: "REPLACE",
      internal: {
        basePath: "https://example.test/tiles",
        hasContent: true,
        hasRenderableContent: true,
        loadingState: 0,
      },
      traversal: { error: 0, inFrustum: false },
    } as unknown as Tile;
    try {
      runtime.scene.onAdd?.(map);
      runtime.scene.update(frame);
      const states = (
        window as unknown as {
          __carmaTiles3d: Set<{
            layerId: string;
            meshRefinementSupport: Set<Tile>;
            meshBaseCoverageReady: boolean;
            memoryAdmissionPaused: boolean;
            loadingPaused: boolean;
            queuedThisTraversal: Set<Tile>;
          }>;
        }
      ).__carmaTiles3d;
      const state = [...states].find(
        (candidate) => candidate.layerId === "support-admission"
      )!;
      state.meshBaseCoverageReady = false;
      const obsolete = {
        ...support,
        content: { uri: "obsolete.b3dm" },
        internal: { ...support.internal, loadingState: 2 },
      } as Tile;
      const remove = vi
        .spyOn(renderer.lruCache, "remove")
        .mockImplementation((tile) => {
          if (tile === obsolete) obsolete.internal.loadingState = 0;
          return true;
        });
      renderer.loadingTiles.add(obsolete);
      runtime.scene.update(frame);
      expect(remove).toHaveBeenCalledWith(obsolete);
      renderer.queueTileForDownload(obsolete);
      expect(nativeQueue).not.toHaveBeenCalled();
      state.meshRefinementSupport.add(obsolete);
      renderer.queueTileForDownload(obsolete);
      expect(nativeQueue).not.toHaveBeenCalled();
      state.meshRefinementSupport.delete(obsolete);
      state.queuedThisTraversal.delete(obsolete);
      nativeQueue.mockClear();

      state.meshRefinementSupport.add(support);
      support.traversal.inFrustum = true;
      renderer.queueTileForDownload(support);
      expect(nativeQueue).toHaveBeenCalledOnce();

      state.queuedThisTraversal.delete(support);
      state.loadingPaused = true;
      renderer.queueTileForDownload(support);
      expect(nativeQueue).toHaveBeenCalledOnce();

      state.loadingPaused = false;
      state.memoryAdmissionPaused = true;
      renderer.queueTileForDownload(support);
      expect(nativeQueue).toHaveBeenCalledOnce();

      state.memoryAdmissionPaused = false;
      support.internal.loadingState = -1;
      renderer.stats.failed = 1;
      renderer.dispatchEvent({
        type: "load-error",
        tile: support,
        error: new Error("status 404"),
        url: "https://example.test/tiles/support.b3dm",
      });
      state.queuedThisTraversal.delete(support);
      renderer.queueTileForDownload(support);
      expect(nativeQueue).toHaveBeenCalledOnce();
    } finally {
      runtime.scene.dispose();
      update.mockRestore();
      nativeQueue.mockRestore();
    }
  });

  it("pauses motion without discarding pending, newly requested, or completed tiles", async () => {
    vi.useFakeTimers();
    let renderer!: TilesRenderer & { loadingTiles: Set<Tile> };
    const update = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function () {
        renderer = this as typeof renderer;
      });
    const handlers = new Map<string, () => void>();
    const map = {
      on: vi.fn((name, callback) => handlers.set(name, callback)),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
      isMoving: () => false,
    } as unknown as MaplibreMap;
    const runtime = buildThreeTilesRuntime("cancel", "mesh.json", [7.2, 51.2], {
      providesTerrain: true,
    });
    const removed: Tile[] = [];
    const request = () => {
      const tile = { internal: { loadingState: 2 } } as Tile;
      renderer.loadingTiles.add(tile);
      renderer.lruCache.add(tile, () => {
        renderer.loadingTiles.delete(tile);
        removed.push(tile);
      });
      return tile;
    };
    try {
      runtime.scene.onAdd?.(map);
      const camera = new THREE.PerspectiveCamera();
      runtime.scene.update({
        map,
        renderCamera: camera,
        lodCamera: camera,
        lookTarget: new THREE.Vector3(),
        viewport: new THREE.Vector2(800, 600),
        localFrame: {
          lngLat: [7.15, 51.25] as const,
          revision: 1,
          sceneFromLocal: new THREE.Matrix4(),
          sceneFromLocalRotation: new THREE.Matrix4(),
          referenceLngLat: [7.15, 51.25] as const,
          sceneFromLocalReference: new THREE.Matrix4(),
          referenceToCurrent: new THREE.Matrix4(),
          currentToReference: new THREE.Matrix4(),
        },
      });
      const old = Array.from({ length: MESH_EVICTION_BATCH_SIZE + 2 }, request);
      handlers.get(MAPLIBRE_EVENT.MOVE_START)?.();
      expect(removed).toEqual([]);
      const fresh = request();
      // An in-flight request may finish while motion has paused queue admission.
      const completed = old.pop()!;
      renderer.loadingTiles.delete(completed);
      await vi.advanceTimersByTimeAsync(0);
      expect(removed).toEqual([]);
      await vi.advanceTimersByTimeAsync(5);
      expect(removed).toEqual([]);
      expect(old.every((tile) => renderer.loadingTiles.has(tile))).toBe(true);
      expect(renderer.lruCache.has(completed)).toBe(true);
      expect(renderer.loadingTiles.has(fresh)).toBe(true);
      handlers.get(MAPLIBRE_EVENT.MOVE)?.();
      await vi.advanceTimersByTimeAsync(200);
      expect(renderer.loadingTiles.has(fresh)).toBe(true);
    } finally {
      runtime.scene.dispose();
      update.mockRestore();
      vi.useRealTimers();
    }
  });

  it("reprioritizes queued meshes by camera distance before shadow-only tiles", () => {
    let renderer: TilesRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this;
      });
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime(
      "mesh",
      "tileset.json",
      [7.15, 51.25],
      { providesTerrain: true }
    );
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    layer.scene.onAdd?.(map);
    layer.scene.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 800),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new THREE.Matrix4(),
        sceneFromLocalRotation: new THREE.Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new THREE.Matrix4(),
        referenceToCurrent: new THREE.Matrix4(),
        currentToReference: new THREE.Matrix4(),
      },
    });

    type QueuedTile = {
      priority?: number;
      traversal: { distanceFromCamera: number };
      internal?: { depth: number; hasUnrenderableContent?: boolean };
      engineData: {
        boundingVolume: {
          getAABB: (target: THREE.Box3) => void;
          getSphere: (target: THREE.Sphere) => void;
          intersectsFrustum: (frustum: THREE.Frustum) => boolean;
        };
      };
    };
    const tileForBox = (box: THREE.Box3, depth = 5): QueuedTile => ({
      traversal: {
        distanceFromCamera: box.distanceToPoint(new THREE.Vector3()),
      },
      internal: { depth },
      engineData: {
        boundingVolume: {
          getAABB: (target) => target.copy(box),
          getSphere: (target) => box.getBoundingSphere(target),
          intersectsFrustum: () => box.min.x < 20,
        },
      },
    });
    const centerTile = tileForBox(
      new THREE.Box3(
        new THREE.Vector3(-0.5, -1.5, -10.5),
        new THREE.Vector3(0.5, -0.5, -9.5)
      )
    );
    const outerVisibleTile = tileForBox(
      new THREE.Box3(
        new THREE.Vector3(3.5, 2.5, -10.5),
        new THREE.Vector3(4.5, 3.5, -9.5)
      )
    );
    const shadowOnlyTile = tileForBox(
      new THREE.Box3(
        new THREE.Vector3(29.5, -0.5, -10.5),
        new THREE.Vector3(30.5, 0.5, -9.5)
      )
    );
    const shallowerVisibleTile = tileForBox(
      new THREE.Box3(
        new THREE.Vector3(5.5, 3.5, -10.5),
        new THREE.Vector3(6.5, 4.5, -9.5)
      ),
      4
    );
    const queue = new PriorityQueue() as PriorityQueue & {
      items: QueuedTile[];
    };
    queue.priorityCallback = (first, second) =>
      (first.priority ?? 0) - (second.priority ?? 0);
    renderer!.downloadQueue.originQueues.set("test", queue);
    queue.items.push(
      centerTile,
      outerVisibleTile,
      shadowOnlyTile,
      shallowerVisibleTile
    );
    const parsingTile = tileForBox(
      new THREE.Box3(
        new THREE.Vector3(-0.5, -0.5, -10.5),
        new THREE.Vector3(0.5, 0.5, -9.5)
      ),
      6
    );
    (
      renderer!.parseQueue as PriorityQueue & { items: QueuedTile[] }
    ).items.push(parsingTile);

    layer.scene.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 800),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new THREE.Matrix4(),
        sceneFromLocalRotation: new THREE.Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new THREE.Matrix4(),
        referenceToCurrent: new THREE.Matrix4(),
        currentToReference: new THREE.Matrix4(),
      },
    });

    // A shallower ancestor no longer outranks a nearer visible request.
    expect(shallowerVisibleTile.priority).toBeLessThan(centerTile.priority!);
    expect(centerTile.priority).toBeGreaterThan(outerVisibleTile.priority!);
    expect(outerVisibleTile.priority).toBeGreaterThan(shadowOnlyTile.priority!);
    expect(parsingTile.priority).toBeDefined();
    expect(parsingTile.priority).toBeGreaterThan(shadowOnlyTile.priority!);
    queue.sort();
    expect(queue.items.at(-1)).toBe(centerTile);

    outerVisibleTile.traversal.distanceFromCamera = 1;
    layer.scene.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 800),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new THREE.Matrix4(),
        sceneFromLocalRotation: new THREE.Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new THREE.Matrix4(),
        referenceToCurrent: new THREE.Matrix4(),
        currentToReference: new THREE.Matrix4(),
      },
    });
    queue.sort();
    expect(queue.items.at(-1)).toBe(outerVisibleTile);

    queue.items.length = 0;
    layer.scene.dispose();
    updateSpy.mockRestore();
  });
});
