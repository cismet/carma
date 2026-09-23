// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import { type Tile } from "3d-tiles-renderer/core";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import { buildThreeTilesRuntime } from "./three-tiles-runtime";

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

describe("coverage runtime integration", () => {
  it("rechecks a stalled settled view on a bounded timer and cancels the audit on disposal", () => {
    vi.useFakeTimers();
    const update = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(() => {});
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
      isMoving: () => false,
    } as unknown as MaplibreMap;
    const runtime = buildThreeTilesRuntime("audit", "mesh.json", [7.2, 51.2], {
      providesTerrain: true,
    });
    const camera = new THREE.PerspectiveCamera();
    runtime.scene.onAdd?.(map);
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
    try {
      const count = vi.mocked(map.triggerRepaint).mock.calls.length;
      vi.advanceTimersByTime(1000);
      expect(vi.mocked(map.triggerRepaint).mock.calls.length).toBeGreaterThan(
        count
      );
      runtime.scene.dispose();
      vi.mocked(map.triggerRepaint).mockClear();
      vi.advanceTimersByTime(2000);
      expect(map.triggerRepaint).not.toHaveBeenCalled();
    } finally {
      runtime.scene.dispose();
      update.mockRestore();
      vi.useRealTimers();
    }
  });

  it("restores fine visible meshes and pins them when upstream proposes a coarse drag fallback", () => {
    type FrontierRenderer = TilesRenderer & {
      setTileVisible: (tile: Tile, visible: boolean) => void;
      setTileActive: (tile: Tile, active: boolean) => void;
      usedSet: Set<Tile>;
    };
    let renderer: FrontierRenderer;
    let proposed: Tile[] | null = null;
    const update = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function () {
        renderer = this as FrontierRenderer;
        this.frameCount += 1;
        if (!proposed) return;
        // Production retention walks the hierarchy, not only visible leaves.
        // Keep the test's loaded family reachable through the same entrypoint.
        renderer.rootTileset = { root: parent } as typeof renderer.rootTileset;
        renderer.usedSet.clear();
        for (const tile of [...renderer.visibleTiles]) {
          renderer.setTileActive(tile, false);
          renderer.setTileVisible(tile, false);
        }
        for (const tile of proposed) {
          renderer.setTileActive(tile, true);
          renderer.setTileVisible(tile, true);
        }
      });
    const handlers = new Map<string, () => void>();
    const map = {
      on: vi.fn((name, callback) => handlers.set(name, callback)),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const runtime = buildThreeTilesRuntime(
      "retained",
      "mesh.json",
      [7.2, 51.2],
      { providesTerrain: true }
    );
    runtime.loading.setErrorTarget(1);
    runtime.scene.onAdd?.(map);
    const camera = new THREE.PerspectiveCamera();
    const frame = {
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
    };
    const createTile = (parent: Tile | null, error: number) =>
      ({
        parent,
        children: [],
        refine: "REPLACE",
        internal: { hasRenderableContent: true, loadingState: 4 },
        traversal: { error, inFrustum: true },
        engineData: { scene: new THREE.Group() },
      } as unknown as Tile);
    const parent = createTile(null, 16);
    const children = Array.from({ length: 4 }, () => createTile(parent, 0.5));
    parent.children = children;
    try {
      proposed = children;
      runtime.scene.update(frame);
      expect(renderer!.visibleTiles).toEqual(new Set(children));
      handlers.get(MAPLIBRE_EVENT.MOVE_START)?.();
      proposed = [parent];
      for (let pass = 0; pass < 3; pass++) {
        runtime.scene.update(frame);
        expect(renderer!.visibleTiles).toEqual(new Set(children));
        // The group also contains the independent debug overlay root.
        expect(renderer!.group.children).not.toContain(parent.engineData.scene);
        for (const child of children)
          expect(renderer!.group.children).toContain(child.engineData.scene);
        for (const child of children)
          expect(renderer!.usedSet.has(child)).toBe(true);
        expect(renderer!.activeTiles.has(parent)).toBe(false);
      }
      handlers.get(MAPLIBRE_EVENT.MOVE_END)?.();
      runtime.scene.update(frame);
      expect(renderer!.visibleTiles).toEqual(new Set(children));
      parent.traversal.error = 1;
      runtime.scene.update(frame);
      // Reaching a looser target never downgrades already visible geometry.
      expect(renderer!.visibleTiles).toEqual(new Set(children));
      expect(renderer!.group.children).not.toContain(parent.engineData.scene);
      for (const child of children)
        expect(renderer!.group.children).toContain(child.engineData.scene);
    } finally {
      runtime.scene.dispose();
      update.mockRestore();
    }
  });

  it("keeps the parent fallback eligible after a child exhausts its retries", () => {
    vi.useFakeTimers();
    type TraversalRenderer = TilesRenderer & {
      queueTileForDownload: (tile: unknown) => void;
      stats: { failed: number };
    };
    const prototype = TilesRenderer.prototype as TraversalRenderer;
    const queueSpy = vi
      .spyOn(prototype, "queueTileForDownload")
      .mockImplementation(() => undefined);
    let renderer: TraversalRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this as TraversalRenderer;
      });
    const map = {
      getCenter: vi.fn(() => ({ lng: 7.15, lat: 51.25 })),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const camera = new THREE.PerspectiveCamera();
    const failedTile = {
      content: { uri: "child.b3dm" },
      internal: {
        basePath: "https://example.test/tiles",
        loadingState: -1,
      },
      traversal: { inFrustum: true },
    };

    layer.scene.onAdd?.(map);
    layer.scene.update({
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
    for (let attempt = 0; attempt < 5; attempt += 1) {
      failedTile.internal.loadingState = -1;
      renderer!.stats.failed = 1;
      renderer!.dispatchEvent({
        type: "load-error",
        tile: failedTile as never,
        error: new Error("status 503"),
        url: "https://example.test/tiles/child.b3dm",
      });
      // The failed tile is released at once (UNLOADED, out of the cache) but
      // not requested again until its backoff fired: the parent keeps
      // rendering as the fallback meanwhile.
      expect(failedTile.internal.loadingState).toBe(0);
      expect(renderer!.stats.failed).toBe(0);
      renderer!.queueTileForDownload(failedTile);
      expect(queueSpy).toHaveBeenCalledTimes(attempt);
      vi.runOnlyPendingTimers();
      // A retry requests a fresh traversal, not a second admission in the old one.
      layer.scene.update({
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
      renderer!.queueTileForDownload(failedTile);
      expect(queueSpy).toHaveBeenCalledTimes(attempt + 1);
    }

    failedTile.internal.loadingState = -1;
    renderer!.stats.failed = 1;
    renderer!.dispatchEvent({
      type: "load-error",
      tile: failedTile as never,
      error: new Error("status 503"),
      url: "https://example.test/tiles/child.b3dm",
    });

    expect(failedTile.internal.loadingState).toBe(0);
    expect(renderer!.stats.failed).toBe(0);
    queueSpy.mockClear();
    renderer!.queueTileForDownload(failedTile);
    expect(queueSpy).not.toHaveBeenCalled();

    // A missing tile is never retried at all.
    const missingTile = {
      content: { uri: "missing.b3dm" },
      internal: { basePath: "https://example.test/tiles", loadingState: -1 },
      traversal: { inFrustum: true },
    };
    renderer!.stats.failed = 1;
    renderer!.dispatchEvent({
      type: "load-error",
      tile: missingTile as never,
      error: new Error("status 404"),
      url: "https://example.test/tiles/missing.b3dm",
    });
    expect(missingTile.internal.loadingState).toBe(0);
    vi.advanceTimersByTime(60_000);
    renderer!.queueTileForDownload(missingTile);
    expect(queueSpy).not.toHaveBeenCalled();

    layer.scene.dispose();
    updateSpy.mockRestore();
    queueSpy.mockRestore();
    vi.useRealTimers();
  });
});
