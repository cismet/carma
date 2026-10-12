import type { Box3 } from "three";
import type { AxisBoundarySite } from "./shared-three-axis-boundaries";
import {
  createAxisCellCacheRuntime,
  type AxisCellWorkerRequest,
  type AxisCellWorkerResponse,
} from "./shared-three-axis-cell-cache.worker";

export type AxisCellCacheOptions = Readonly<{
  cellSizeMeters?: number;
  maxCells?: number;
  maxIndexBytes?: number;
}>;
export type AxisCellCacheLimits = Readonly<{
  cellSizeMeters: number;
  maxCells: number;
  maxIndexBytes: number;
}>;
export type AxisCellBounds = readonly [
  number,
  number,
  number,
  number,
  number,
  number
];
export type AxisCellQueryMetrics = Readonly<{
  generation: number;
  sourceCount: number;
  candidateCount: number;
  cellCount: number;
  cacheHits: number;
  /** Cells restored from worker IndexedDB for this query. */
  persistentHits?: number;
  cacheMisses: number;
  fallback: boolean;
  fallbackReason?:
    | "null-bounds"
    | "cell-budget"
    | "index-budget"
    | "worker-error";
  bvhNodesVisited: number;
  leafSitesTested: number;
  indexBytes: number;
  elapsedMs: number;
}>;
export type AxisCellQueryResult = Readonly<{
  /** Selected sources, with the latest preferred-axis metadata. */
  sites: readonly AxisBoundarySite[];
  /** Indices into the complete stable-ID-sorted source pool. */
  indices: Uint32Array;
  metrics: AxisCellQueryMetrics;
}>;
export type AxisCellCacheRuntimeResult = Readonly<{
  indices: Uint32Array;
  metrics: AxisCellQueryMetrics;
}>;

const limitsFor = (options: AxisCellCacheOptions): AxisCellCacheLimits => ({
  cellSizeMeters:
    Number.isFinite(options.cellSizeMeters) && options.cellSizeMeters! > 0
      ? options.cellSizeMeters!
      : 64,
  maxCells: Number.isFinite(options.maxCells)
    ? Math.max(0, Math.floor(options.maxCells!))
    : 2048,
  maxIndexBytes: Number.isFinite(options.maxIndexBytes)
    ? Math.max(0, Math.floor(options.maxIndexBytes!))
    : 8 * 1024 * 1024,
});
const boundsFor = (bounds: Box3 | null): AxisCellBounds | null => {
  if (!bounds) return null;
  if (bounds.isEmpty()) return [1, 1, 1, -1, -1, -1];
  const values = [...bounds.min.toArray(), ...bounds.max.toArray()];
  return values.every(Number.isFinite)
    ? (values as unknown as AxisCellBounds)
    : null;
};

/** Terrain-independent, single-level world-cell admissions. Geometry lives in
 * one worker; cells retain only source indices, never duplicated source tables. */
export const createAxisCellCache = (options: AxisCellCacheOptions = {}) => {
  const limits = limitsFor(options);
  let sites: readonly AxisBoundarySite[] = [];
  let activePersistenceKey: string | undefined;
  let generation = 0;
  let disposed = false;
  let failed = false;
  let nextId = 0;
  let worker: Worker | undefined;
  let runtime: ReturnType<typeof createAxisCellCacheRuntime> | undefined;
  let fallbackQueue = Promise.resolve();
  const pending = new Map<
    number,
    {
      generation: number;
      started: number;
      signal?: AbortSignal;
      abort: () => void;
      finish: (result: AxisCellQueryResult | null) => void;
    }
  >();
  const finish = (id: number, result: AxisCellQueryResult | null) => {
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    job.signal?.removeEventListener("abort", job.abort);
    job.finish(result);
  };
  const completeFallback = (id: number) => {
    const job = pending.get(id);
    if (!job) return;
    if (disposed || job.generation !== generation || job.signal?.aborted) {
      finish(id, null);
      return;
    }
    const indices = Uint32Array.from(sites, (_, index) => index);
    finish(id, {
      sites: [...sites],
      indices,
      metrics: {
        generation,
        sourceCount: sites.length,
        candidateCount: sites.length,
        cellCount: 0,
        cacheHits: 0,
        cacheMisses: 0,
        fallback: true,
        fallbackReason: "worker-error",
        bvhNodesVisited: 0,
        leafSitesTested: 0,
        indexBytes: 0,
        elapsedMs: performance.now() - job.started,
      },
    });
  };
  const receive = (id: number, result: AxisCellCacheRuntimeResult | null) => {
    const job = pending.get(id);
    if (!job) return;
    if (
      !result ||
      disposed ||
      job.generation !== generation ||
      job.signal?.aborted ||
      result.metrics.generation !== generation
    ) {
      finish(id, null);
      return;
    }
    finish(id, {
      indices: result.indices,
      sites: Array.from(result.indices, (index) => sites[index]),
      metrics: {
        ...result.metrics,
        elapsedMs: performance.now() - job.started,
      },
    });
  };
  const failWorker = () => {
    failed = true;
    worker?.terminate();
    worker = undefined;
    for (const id of [...pending.keys()]) completeFallback(id);
  };
  const ensureBackend = () => {
    if (worker || runtime || failed || disposed) return;
    if (typeof Worker === "function") {
      try {
        worker = new Worker(
          new URL("./shared-three-axis-cell-cache.worker.ts", import.meta.url),
          { type: "module" }
        );
        worker.onmessage = (event: MessageEvent<AxisCellWorkerResponse>) => {
          const response = event.data;
          if (response.type === "result") receive(response.id, response.result);
          else failWorker();
        };
        worker.onerror = failWorker;
        worker.onmessageerror = failWorker;
        const request: AxisCellWorkerRequest = { type: "init", limits };
        worker.postMessage(request);
      } catch {
        worker?.terminate();
        worker = undefined;
      }
    }
    if (!worker) runtime = createAxisCellCacheRuntime(limits);
  };

  return {
    setSites(
      input: readonly AxisBoundarySite[],
      persistenceKey?: string
    ): boolean {
      if (disposed) return false;
      const ordered = [...input].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      );
      const geometryChanged =
        ordered.length !== sites.length ||
        ordered.some((site, index) => {
          const previous = sites[index];
          return (
            site.id !== previous.id ||
            !site.eye.equals(previous.eye) ||
            !site.sceneToImage.equals(previous.sceneToImage)
          );
        });
      const changed =
        geometryChanged ||
        ordered.some(
          (site, index) => !site.direction.equals(sites[index].direction)
        );
      const keyChanged = persistenceKey !== activePersistenceKey;
      if (!changed && !keyChanged) return false;
      activePersistenceKey = persistenceKey;
      sites = ordered.map((site) => ({
        id: site.id,
        eye: site.eye.clone(),
        sceneToImage: site.sceneToImage.clone(),
        direction: site.direction.clone(),
      }));
      if (!geometryChanged && !keyChanged) return true;
      generation++;
      for (const id of [...pending.keys()]) {
        worker?.postMessage({
          type: "cancel",
          id,
        } satisfies AxisCellWorkerRequest);
        finish(id, null);
      }
      if (failed || (!sites.length && !worker && !runtime)) return true;
      ensureBackend();
      const geometry = new Float64Array(sites.length * 19);
      sites.forEach((site, index) => {
        geometry.set(site.eye.toArray(), index * 19);
        geometry.set(site.sceneToImage.elements, index * 19 + 3);
      });
      if (worker) {
        const request: AxisCellWorkerRequest = {
          type: "sites",
          geometry,
          generation,
          persistenceKey,
        };
        try {
          worker.postMessage(request, [geometry.buffer]);
        } catch {
          failWorker();
        }
      } else runtime!.setGeometry(geometry, generation);
      return true;
    },
    queryBounds(
      bounds: Box3 | null,
      signal?: AbortSignal
    ): Promise<AxisCellQueryResult | null> {
      if (disposed || signal?.aborted) return Promise.resolve(null);
      const query = boundsFor(bounds);
      if (
        !sites.length ||
        (query &&
          (query[0] > query[3] || query[1] > query[4] || query[2] > query[5]))
      )
        return Promise.resolve({
          sites: [],
          indices: new Uint32Array(),
          metrics: {
            generation,
            sourceCount: sites.length,
            candidateCount: 0,
            cellCount: 0,
            cacheHits: 0,
            cacheMisses: 0,
            fallback: query === null,
            fallbackReason: query === null ? "null-bounds" : undefined,
            bvhNodesVisited: 0,
            leafSitesTested: 0,
            indexBytes: 0,
            elapsedMs: 0,
          },
        });
      ensureBackend();
      const id = ++nextId;
      return new Promise((resolve) => {
        const abort = () => {
          worker?.postMessage({
            type: "cancel",
            id,
          } satisfies AxisCellWorkerRequest);
          finish(id, null);
        };
        pending.set(id, {
          generation,
          started: performance.now(),
          signal,
          abort,
          finish: resolve,
        });
        signal?.addEventListener("abort", abort, { once: true });
        if (failed) {
          completeFallback(id);
          return;
        }
        if (worker) {
          try {
            worker.postMessage({
              type: "query",
              id,
              generation,
              bounds: query,
            } satisfies AxisCellWorkerRequest);
          } catch {
            failWorker();
          }
        } else {
          const requestedGeneration = generation;
          fallbackQueue = fallbackQueue.then(async () => {
            if (!pending.has(id)) return;
            try {
              const result = await runtime!.queryBounds(
                query,
                () =>
                  !disposed &&
                  pending.has(id) &&
                  requestedGeneration === generation &&
                  !signal?.aborted
              );
              receive(id, result);
            } catch {
              completeFallback(id);
            }
          });
        }
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const id of [...pending.keys()]) finish(id, null);
      worker?.terminate();
      worker = undefined;
      runtime?.dispose();
      sites = [];
    },
  };
};

export type AxisCellCache = ReturnType<typeof createAxisCellCache>;
