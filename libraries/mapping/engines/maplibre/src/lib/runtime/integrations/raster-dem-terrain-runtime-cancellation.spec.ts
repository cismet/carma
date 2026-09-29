import {
  Box3,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { getTileBounds } from "../../core/raster-dem-tile";
import { buildTerrainSelection } from "../../core/terrain-selection";
import { executeTerrainWorkerTask } from "./terrain-worker-task";
import type { TerrainSelectionEntry } from "../../core/terrain-selection-types";
import {
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_CAMERA_PRIORITY,
} from "../../core/tile-camera-demand";
import * as terrainWorkers from "./terrain-worker-client";
import {
  createIdlePrefetchFixture,
  installRasterDemTerrainRuntimeFixture,
} from "./raster-dem-terrain-runtime.test-support";

describe("buildRasterDemTerrainRuntime selection cancellation", () => {
  installRasterDemTerrainRuntimeFixture();

  it("reprioritizes existing raster demand on camera selection and resumes lower-ranked work without replacing loaded coverage", async () => {
    const f = createIdlePrefetchFixture("camera-priority");
    let worker: { mockRestore: () => void } | undefined;
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      const retained = f.runtime.root.children.filter((node) => node.visible);
      let entries: TerrainSelectionEntry[] = [
        {
          id: { level: 10, x: 533, y: 218 },
          kind: "source",
          priority: TILE_CAMERA_PRIORITY.PRIMARY,
        },
        {
          id: { level: 10, x: 534, y: 218 },
          kind: "source",
          priority: TILE_CAMERA_PRIORITY.SECONDARY,
        },
      ];
      const completions = new Map<number, () => void>();
      const signals: AbortSignal[] = [];
      f.source.requestTile.mockClear();
      f.source.requestTile.mockImplementation(
        (id, signal) =>
          new Promise((resolve, reject) => {
            signals.push(signal!);
            signal!.addEventListener("abort", () => reject(signal!.reason), {
              once: true,
            });
            completions.set(id.x, () => resolve(f.makeTile(id)));
          })
      );
      vi.stubGlobal("Worker", class {});
      worker = vi
        .spyOn(terrainWorkers, "runTerrainWorkerTask")
        .mockImplementation((task, signal) => {
          if (task.kind !== "select")
            return executeTerrainWorkerTask(structuredClone(task), signal);
          return Promise.resolve({
            kind: "select",
            selection: {
              entries,
              viewportStages: [entries],
              loadEntries: entries,
              signature: entries
                .map((entry) => `${entry.id.x}:${entry.priority}`)
                .join("|"),
              viewportElevationSignature: "camera-priority",
            },
          });
        });
      f.frame.renderCamera.position.x += 0.01;
      f.runtime.update(f.frame);
      await vi.waitFor(() =>
        expect(f.source.requestTile.mock.calls.map(([id]) => id.x)).toEqual([
          533,
        ])
      );
      expect(f.runtime.root.children.filter((node) => node.visible)).toEqual(
        retained
      );
      entries = entries.map((entry) => ({
        ...entry,
        priority:
          entry.id.x === 534
            ? TILE_CAMERA_PRIORITY.FOCUS
            : TILE_CAMERA_PRIORITY.PRIMARY,
      }));
      f.frame.renderCamera.position.x += 0.01;
      f.runtime.update(f.frame);
      await vi.waitFor(() =>
        expect(f.source.requestTile.mock.calls.map(([id]) => id.x)).toEqual([
          533, 534,
        ])
      );
      expect(signals[0].aborted).toBe(true);
      expect(signals[1].aborted).toBe(false);
      expect(f.runtime.root.children.filter((node) => node.visible)).toEqual(
        retained
      );
      completions.get(534)!();
      await vi.waitFor(() =>
        expect(f.source.requestTile.mock.calls.map(([id]) => id.x)).toEqual([
          533, 534, 533,
        ])
      );
      completions.get(533)!();
      await vi.waitFor(() =>
        expect(f.source.trimCache).toHaveBeenCalledTimes(2)
      );
      expect(f.onError).not.toHaveBeenCalled();
      expect(
        f.source.requestTile.mock.calls.filter(([id]) => id.x === 534)
      ).toHaveLength(1);
      expect(
        f.runtime.root.children.some((node) => node.name.endsWith("534/218"))
      ).toBe(true);
    } finally {
      f.runtime.dispose();
      worker?.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("discards a superseded worker selection before admitting its obsolete tiles", async () => {
    const f = createIdlePrefetchFixture("latest-worker-selection");
    const queued: { complete: () => void }[] = [];
    let worker: { mockRestore: () => void } | undefined;
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      vi.stubGlobal("Worker", class {});
      worker = vi
        .spyOn(terrainWorkers, "runTerrainWorkerTask")
        .mockImplementation((task, signal) => {
          if (task.kind !== "select")
            return executeTerrainWorkerTask(structuredClone(task), signal);
          const selection = buildTerrainSelection(task.input, {
            getTileGridIdsForBounds: f.source.getTileGridIdsForBounds,
            getTileBounds: f.source.getTileBounds,
            getTileGeometricError: f.source.getLevelMaximumGeometricError,
            getTileDataAvailable: f.source.getTileDataAvailable,
          });
          return new Promise((resolve) => {
            queued.push({
              complete: () => resolve({ kind: "select", selection }),
            });
          });
        });
      f.source.getTileGridIdsForBounds.mockReturnValue([
        { level: 10, x: 533, y: 218 },
      ]);
      f.frame.renderCamera.position.x += 0.01;
      f.runtime.update(f.frame);
      f.source.getTileGridIdsForBounds.mockReturnValue([
        { level: 10, x: 534, y: 218 },
      ]);
      f.frame.renderCamera.position.x += 0.01;
      f.runtime.update(f.frame);
      expect(queued).toHaveLength(1);
      queued[0].complete();
      await vi.waitFor(() => expect(queued).toHaveLength(2));
      expect(f.source.requestTile.mock.calls.some(([id]) => id.x === 533)).toBe(
        false
      );
      queued[1].complete();
      await vi.waitFor(() =>
        expect(
          f.source.requestTile.mock.calls.some(([id]) => id.x === 534)
        ).toBe(true)
      );
      expect(f.source.requestTile.mock.calls.some(([id]) => id.x === 533)).toBe(
        false
      );
    } finally {
      f.runtime.dispose();
      worker?.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it.each(["none", "camera", "sun", "geographic-edge"] as const)(
    "cancels offscreen requests during continuous motion before selection replies (protection=%s)",
    async (protection) => {
      const f = createIdlePrefetchFixture(`continuous-motion-${protection}`);
      let signal: AbortSignal | undefined;
      let worker: { mockRestore: () => void } | undefined;
      const extra = new OrthographicCamera(
        -50_000,
        50_000,
        50_000,
        -50_000,
        1,
        100_000
      );
      extra.position.set(0, 20_000, 0);
      extra.lookAt(0, 0, 0);
      extra.updateMatrixWorld(true);
      const frame = {
        ...f.frame,
        tileCameraViews: snapshotTileCameraViews([]),
      };
      try {
        await f.start();
        await vi.waitFor(() =>
          expect(f.source.trimCache).toHaveBeenCalledOnce()
        );
        const floor = [...f.runtime.root.children];
        f.source.requestTile.mockImplementation(
          (_id, requestSignal) =>
            new Promise((_resolve, reject) => {
              signal = requestSignal;
              signal!.addEventListener("abort", () => reject(signal!.reason), {
                once: true,
              });
            })
        );
        f.source.getTileGridIdsForBounds.mockReturnValue([
          { level: 10, x: 533, y: 218 },
        ]);
        frame.renderCamera.position.x += 0.01;
        f.runtime.update(frame);
        await vi.waitFor(() => expect(signal).toBeDefined());
        vi.stubGlobal("Worker", class {});
        worker = vi
          .spyOn(terrainWorkers, "runTerrainWorkerTask")
          .mockImplementation((task, workerSignal) =>
            task.kind === "select"
              ? new Promise(() => {})
              : executeTerrainWorkerTask(structuredClone(task), workerSignal)
          );
        const observer = new PerspectiveCamera(60, 1, 1, 100);
        observer.position.set(10_000_000, 0, 0);
        frame.renderCamera = observer;
        f.map.getBounds.mockReturnValue({
          getWest: () => (protection === "geographic-edge" ? 7.2 : 10),
          getEast: () => (protection === "geographic-edge" ? 7.3 : 10.1),
          getSouth: () => 51,
          getNorth: () => 51.3,
        });
        if (protection === "camera")
          frame.tileCameraViews = snapshotTileCameraViews([
            {
              id: "retain-caster",
              camera: extra,
              viewport: [800, 600],
              errorTargetPixels: 2,
              role: TILE_CAMERA_ROLE.GEOMETRY,
            },
          ]);
        if (protection === "sun")
          f.runtime.setShadowView({
            camera: extra,
            shadowMapSize: { width: 1024, height: 1024 },
          });
        for (let index = 0; index < 6; index++) {
          observer.position.x += 1;
          f.runtime.update(frame);
          expect(signal!.aborted).toBe(protection === "none");
        }
        // No selection has replied; further changes still reject stale work
        // immediately once its last extra camera/caster consumer is removed.
        frame.tileCameraViews = [];
        f.runtime.setShadowView(null);
        f.map.getBounds.mockReturnValue({
          getWest: () => 10,
          getEast: () => 10.1,
          getSouth: () => 51,
          getNorth: () => 51.3,
        });
        observer.position.x += 1;
        f.runtime.update(frame);
        expect(signal!.aborted).toBe(true);
        for (const node of floor) expect(node.parent).toBe(f.runtime.root);
        expect(f.onError).not.toHaveBeenCalled();
        expect(
          vi
            .mocked(terrainWorkers.runTerrainWorkerTask)
            .mock.calls.filter(([task]) => task.kind === "select")
        ).toHaveLength(1);
      } finally {
        f.runtime.dispose();
        worker?.mockRestore();
        vi.unstubAllGlobals();
      }
    }
  );

  it("retains the loaded visible surface when drag-start selection has no replacement", async () => {
    const f = createIdlePrefetchFixture("drag-coverage");
    const camera = new OrthographicCamera(
      -50_000,
      50_000,
      50_000,
      -50_000,
      1,
      100_000
    );
    camera.position.set(0, 10_000, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    f.frame.renderCamera = camera;
    await f.start();
    await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledTimes(1));
    const visible = f.runtime.root.children.filter((node) => node.visible);
    expect(visible).toHaveLength(1);
    const geometry = (visible[0].children[0] as Mesh).geometry;
    const dispose = vi.spyOn(geometry, "dispose");

    f.listeners.get("movestart")!();
    f.source.getTileGridIdsForBounds.mockReturnValue([]);
    f.frame.lodCamera.position.x += 100;
    f.runtime.update(f.frame);
    await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledTimes(2));
    expect(visible[0].visible).toBe(true);
    expect(visible[0].parent).toBe(f.runtime.root);
    expect(dispose).not.toHaveBeenCalled();
    f.runtime.dispose();
  });

  it("retains an offscreen caster in the shadow frustum across an empty transient selection", async () => {
    const f = createIdlePrefetchFixture("offscreen-caster-retention");
    const shadowCamera = new OrthographicCamera(
      -50000,
      50000,
      50000,
      -50000,
      1,
      100000
    );
    shadowCamera.position.set(0, 10000, 0);
    shadowCamera.lookAt(0, 0, 0);
    shadowCamera.updateMatrixWorld(true);
    f.runtime.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 1024, height: 1024 },
    });
    await f.start();
    await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledTimes(1));
    const visible = f.runtime.root.children.filter((node) => node.visible);
    expect(visible).toHaveLength(1);
    f.source.getTileGridIdsForBounds.mockReturnValue([]);
    // Mutating the external controller must not mutate the accepted shadow view.
    shadowCamera.position.x += 1000000;
    shadowCamera.updateMatrixWorld(true);
    f.frame.lodCamera.position.x += 100;
    f.runtime.update(f.frame);
    await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledTimes(2));
    expect(visible[0].visible).toBe(true);
    f.runtime.dispose();
  });

  it("reports target-LOD readiness only after its selected terrain is published", async () => {
    const f = createIdlePrefetchFixture("corridor-readiness");
    const region = new Box3(
      new Vector3(-100, -100, -100),
      new Vector3(100, 200, 100)
    );
    expect(f.runtime.isShadowRegionReady?.(region)).toBe(false);
    await f.start();
    await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledTimes(1));
    expect(f.runtime.isShadowRegionReady?.(region)).toBe(true);
    f.runtime.dispose();
    expect(f.runtime.isShadowRegionReady?.(region)).toBe(false);
  });
});
