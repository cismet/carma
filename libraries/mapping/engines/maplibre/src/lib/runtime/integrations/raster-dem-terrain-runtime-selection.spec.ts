import { PerspectiveCamera, Vector2 } from "three";
import { describe, expect, it, vi } from "vitest";
import { getTileBounds } from "../../core/raster-dem-tile";
import { buildTerrainSelection } from "../../core/terrain-selection";
import { executeTerrainWorkerTask } from "./terrain-worker-task";
import type { TerrainTileId } from "../../core/raster-dem-tile";
import {
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
} from "../../core/tile-camera-demand";
import * as terrainWorkers from "./terrain-worker-client";
import * as requestConcurrency from "./payload-aware-request-concurrency";
import {
  createIdlePrefetchFixture,
  installRasterDemTerrainRuntimeFixture,
} from "./raster-dem-terrain-runtime.test-support";

describe("buildRasterDemTerrainRuntime selection dispatch", () => {
  installRasterDemTerrainRuntimeFixture();

  it("does not reselect terrain on DPR-only changes and sends CSS dimensions to workers", async () => {
    const f = createIdlePrefetchFixture("css-terrain-demand");
    let worker: { mockRestore: () => void } | undefined;
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      vi.stubGlobal("Worker", class {});
      const inputs: Array<readonly number[]> = [];
      worker = vi
        .spyOn(terrainWorkers, "runTerrainWorkerTask")
        .mockImplementation((task, signal) => {
          if (task.kind !== "select")
            return executeTerrainWorkerTask(structuredClone(task), signal);
          inputs.push(task.input.viewport);
          return Promise.resolve({
            kind: "select",
            selection: buildTerrainSelection(task.input, {
              getTileGridIdsForBounds: f.source.getTileGridIdsForBounds,
              getTileBounds: f.source.getTileBounds,
              getTileGeometricError: f.source.getLevelMaximumGeometricError,
              getTileDataAvailable: f.source.getTileDataAvailable,
            }),
          });
        });
      f.source.requestTile.mockClear();
      for (const dpr of [1.25, 2, 3]) {
        f.runtime.update({
          ...f.frame,
          viewport: new Vector2(1000 * dpr, 1000 * dpr),
          cssViewport: new Vector2(1000, 1000),
        });
      }
      expect(inputs).toHaveLength(0);
      expect(f.source.requestTile).not.toHaveBeenCalled();
      f.runtime.update({
        ...f.frame,
        viewport: new Vector2(1800, 1800),
        cssViewport: new Vector2(900, 900),
      });
      await vi.waitFor(() => expect(inputs).toEqual([[900, 900]]));
    } finally {
      f.runtime.dispose();
      worker?.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("wakes the host when an unchanged worker selection drains the request queue", async () => {
    const f = createIdlePrefetchFixture("selection-idle-wakeup");
    let finishSelection: (() => void) | undefined;
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
            finishSelection = () => resolve({ kind: "select", selection });
          });
        });
      f.frame.lodCamera.position.x += 10;
      f.runtime.update(f.frame);
      expect(f.runtime.getRequestDemand?.()).toBe(1);
      expect(finishSelection).toBeDefined();
      f.map.triggerRepaint.mockClear();
      finishSelection!();
      await vi.waitFor(() => expect(f.runtime.getRequestDemand?.()).toBe(0));
      expect(f.map.triggerRepaint).toHaveBeenCalledOnce();
      expect(f.source.trimCache).toHaveBeenCalledOnce();
      expect(f.source.requestTile).toHaveBeenCalledOnce();
    } finally {
      f.runtime.dispose();
      worker?.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("does not count an intentional focus-request abort as capacity failure", async () => {
    const createConcurrency =
      requestConcurrency.createPayloadAwareRequestConcurrency;
    const observeFailure = vi.fn();
    const concurrency = vi
      .spyOn(requestConcurrency, "createPayloadAwareRequestConcurrency")
      .mockImplementation((...args) => {
        const policy = createConcurrency(...args);
        return {
          ...policy,
          observeFailure: (error) => {
            observeFailure(error);
            return policy.observeFailure(error);
          },
        };
      });
    const f = createIdlePrefetchFixture("zoom-abort-capacity", 12);
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      const [camera] = snapshotTileCameraViews([
        {
          id: "focus",
          camera: new PerspectiveCamera(),
          viewport: [128, 128],
          errorTargetPixels: 2,
          role: TILE_CAMERA_ROLE.GEOMETRY,
        },
      ]);
      const bounds = getTileBounds({ level: 10, x: 532, y: 218 });
      const request = {
        camera,
        levels: 2 as const,
        lngLat: [
          (bounds.west + bounds.east) / 2,
          (bounds.south + bounds.north) / 2,
        ] as const,
      };
      let activeSignal: AbortSignal | undefined;
      f.source.requestTile.mockImplementationOnce(
        (_id, signal) =>
          new Promise((_resolve, reject) => {
            activeSignal = signal;
            signal!.addEventListener("abort", () => reject(signal!.reason), {
              once: true,
            });
          })
      );
      const controller = new AbortController();
      const result = f.runtime.prefetchZoom!(request, controller.signal).catch(
        (error) => error
      );
      await vi.waitFor(() => expect(activeSignal).toBeDefined());
      controller.abort();
      expect(await result).toMatchObject({ name: "AbortError" });
      expect(observeFailure).not.toHaveBeenCalled();
      // Genuine network failures must still feed the existing adaptive policy.
      const networkError = new TypeError("Failed to fetch");
      f.source.requestTile.mockRejectedValueOnce(networkError);
      await expect(
        f.runtime.prefetchZoom!(request, new AbortController().signal)
      ).rejects.toBe(networkError);
      expect(observeFailure).toHaveBeenCalledOnce();
      expect(observeFailure).toHaveBeenCalledWith(networkError);
    } finally {
      f.runtime.dispose();
      concurrency.mockRestore();
    }
  });

  it("reconciles matrix-only camera changes without cancelling overlapping work or published coverage", async () => {
    const f = createIdlePrefetchFixture("latest-matrix-demand");
    const requests = new Map<string, AbortSignal>();
    const key = ({ level, x, y }: TerrainTileId) => `${level}/${x}/${y}`;
    // Public MapLibre state remains unchanged: the independent camera moves.
    Object.assign(f.map, { getCenter: () => ({ lng: 7.15, lat: 51.256 }) });
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      const visible = f.runtime.root.children.filter((node) => node.visible);
      f.source.requestTile.mockImplementation(
        (id, signal) =>
          new Promise((_resolve, reject) => {
            requests.set(key(id), signal!);
            signal!.addEventListener("abort", () => reject(signal!.reason), {
              once: true,
            });
          })
      );
      const first = { level: 10, x: 533, y: 218 };
      const shared = { level: 10, x: 534, y: 218 };
      const next = { level: 10, x: 535, y: 218 };
      f.source.getTileGridIdsForBounds.mockReturnValue([first, shared]);
      f.frame.renderCamera.position.x += 0.01;
      f.runtime.update(f.frame);
      await vi.waitFor(() => expect(requests.has(key(shared))).toBe(true));
      const obsoleteSignal = requests.get(key(first))!;
      const sharedSignal = requests.get(key(shared))!;
      // Arbitrarily small matrix jitter resolves to the same demand cut.
      for (let index = 0; index < 5; index++) {
        f.frame.renderCamera.position.x += 1e-9;
        f.runtime.update(f.frame);
      }
      expect(obsoleteSignal.aborted).toBe(false);
      expect(sharedSignal.aborted).toBe(false);
      expect(
        f.source.requestTile.mock.calls.filter(
          ([id]) => key(id) === key(shared)
        )
      ).toHaveLength(1);
      f.source.getTileGridIdsForBounds.mockReturnValue([shared, next]);
      f.frame.renderCamera.position.x += 0.01;
      f.runtime.update(f.frame);
      await vi.waitFor(() => expect(requests.has(key(next))).toBe(true));
      expect(obsoleteSignal.aborted).toBe(true);
      expect(sharedSignal.aborted).toBe(false);
      expect(
        f.source.requestTile.mock.calls.filter(
          ([id]) => key(id) === key(shared)
        )
      ).toHaveLength(1);
      for (const node of visible) expect(node.visible).toBe(true);
      expect(f.onError).not.toHaveBeenCalled();
      // Cancellation is not an unavailable-tile mark: returning can fetch it.
      f.source.getTileGridIdsForBounds.mockReturnValue([first, shared]);
      f.frame.renderCamera.position.x += 0.01;
      f.runtime.update(f.frame);
      await vi.waitFor(() =>
        expect(
          f.source.requestTile.mock.calls.filter(
            ([id]) => key(id) === key(first)
          )
        ).toHaveLength(2)
      );
      expect(sharedSignal.aborted).toBe(false);
    } finally {
      f.runtime.dispose();
    }
  });

  it("keeps the latest same-cut view eligible for idle work when its shared request completes", async () => {
    const f = createIdlePrefetchFixture("same-cut-jitter-completion");
    let complete!: () => void;
    let signal: AbortSignal | undefined;
    f.source.requestTile.mockImplementationOnce(
      (id, requestSignal) =>
        new Promise((resolve) => {
          signal = requestSignal;
          complete = () => resolve(f.makeTile(id));
        })
    );
    try {
      await f.start();
      await vi.waitFor(() => expect(signal).toBeDefined());
      f.frame.renderCamera.position.x += 1e-9;
      f.runtime.update(f.frame);
      expect(signal!.aborted).toBe(false);
      expect(f.source.requestTile).toHaveBeenCalledOnce();
      complete();
      await vi.waitFor(() =>
        expect(f.runtime.getIdlePrefetchAvailability().ready).toBe(true)
      );
      expect(f.source.requestTile).toHaveBeenCalledOnce();
    } finally {
      f.runtime.dispose();
    }
  });

  it("cancels finer pending terrain when zooming out and keeps the loaded coarse floor", async () => {
    const f = createIdlePrefetchFixture("coarser-demand-cancel", 12);
    const fineRequests: AbortSignal[] = [];
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      const floor = f.runtime.root.children.filter((node) => node.visible);
      f.source.getLevelMaximumGeometricError.mockReturnValue(1e9);
      f.source.requestTile.mockImplementation(
        (_id, signal) =>
          new Promise((_resolve, reject) => {
            fineRequests.push(signal!);
            signal!.addEventListener("abort", () => reject(signal!.reason), {
              once: true,
            });
          })
      );
      f.frame.lodCamera.position.y = 1001;
      f.runtime.update(f.frame);
      await vi.waitFor(() => expect(fineRequests.length).toBeGreaterThan(0));
      expect(
        f.source.requestTile.mock.calls.slice(1).every(([id]) => id.level > 10)
      ).toBe(true);
      f.frame.lodCamera.position.y = 1e12;
      f.runtime.update(f.frame);
      expect(fineRequests.every((signal) => signal.aborted)).toBe(true);
      await vi.waitFor(() => expect(f.runtime.getRequestDemand?.()).toBe(0));
      for (const node of floor) expect(node.visible).toBe(true);
      expect(f.onError).not.toHaveBeenCalled();
      expect(
        f.source.requestTile.mock.calls.filter(([id]) => id.level === 10)
      ).toHaveLength(1);
    } finally {
      f.runtime.dispose();
    }
  });
});
