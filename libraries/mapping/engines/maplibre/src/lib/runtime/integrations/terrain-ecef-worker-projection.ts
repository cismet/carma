import { Box3, BufferAttribute, BufferGeometry, Sphere, Vector3 } from "three";
import { TERRAIN_WORKER_TASK_KIND } from "../../core/terrain-worker-protocol";
import type { TerrainEcefConversionInput } from "./terrain-ecef-conversion";
import { runTerrainWorkerTask } from "./terrain-worker-client";

/** Copy mutable seam buffers at submission. Source-grid and baseline heights
 * remain immutable; no borrowed native buffers are transferred or detached. */
export const snapshotTerrainEcefSeamInput = (
  input: TerrainEcefConversionInput
): TerrainEcefConversionInput => ({
  ...input,
  positions: input.positions.slice(),
  normals: input.normals.slice(),
  indices: input.indices.slice(),
});

export const projectTerrainEcefInWorker = async (
  input: TerrainEcefConversionInput,
  nativeIndices: Uint16Array | Uint32Array,
  signal?: AbortSignal,
  background = false
) => {
  const result = await runTerrainWorkerTask(
    { kind: TERRAIN_WORKER_TASK_KIND.PROJECT_ECEF, input, background },
    signal
  );
  signal?.throwIfAborted();
  if (result.kind !== TERRAIN_WORKER_TASK_KIND.PROJECT_ECEF)
    throw new Error("Unexpected ECEF terrain worker result");
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(result.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(result.normals, 3));
  geometry.setIndex(
    new BufferAttribute(
      result.indicesUnchanged ? nativeIndices : result.indices,
      1
    )
  );
  geometry.boundingBox = new Box3(
    new Vector3().fromArray(result.box.min),
    new Vector3().fromArray(result.box.max)
  );
  geometry.boundingSphere = new Sphere(
    new Vector3().fromArray(result.sphere.center),
    result.sphere.radius
  );
  return {
    geometry,
    nativeBaseHeights: result.nativeBaseHeights,
    recomputeMs: result.recomputeMs,
    ecefBounds: new Box3(
      new Vector3().fromArray(result.ecefBounds.min),
      new Vector3().fromArray(result.ecefBounds.max)
    ),
  };
};

type Projection = Awaited<ReturnType<typeof projectTerrainEcefInWorker>>;

type BackgroundJob = {
  signal: AbortSignal;
  run: () => Promise<Projection | null>;
  resolve: (value: Projection | null) => void;
  reject: (error: unknown) => void;
};
const backgroundJobs: BackgroundJob[] = [];
let backgroundActive = false;
let allocationRetryAt = 0;
let allocationWarningAt = -Infinity;
let backgroundRetry: ReturnType<typeof setTimeout> | null = null;
const allocationFailed = (error: unknown) =>
  /array buffer allocation|out of memory/i.test(String(error));
const pumpBackground = () => {
  if (backgroundActive || !backgroundJobs.length) return;
  if (performance.now() < allocationRetryAt) {
    backgroundRetry ??= setTimeout(() => {
      backgroundRetry = null;
      pumpBackground();
    }, allocationRetryAt - performance.now());
    return;
  }
  const job = backgroundJobs.shift()!;
  if (job.signal.aborted) {
    job.reject(job.signal.reason);
    pumpBackground();
    return;
  }
  backgroundActive = true;
  // Only admission invokes the callback that snapshots mutable buffers.
  Promise.resolve()
    .then(() => {
      job.signal.throwIfAborted();
      return job.run();
    })
    .then((projection) => {
      if (job.signal.aborted) {
        projection?.geometry.dispose();
        job.reject(job.signal.reason);
      } else job.resolve(projection);
    })
    .catch((error) => {
      if (allocationFailed(error)) allocationRetryAt = performance.now() + 5000;
      job.reject(error);
    })
    .finally(() => {
      backgroundActive = false;
      pumpBackground();
    });
};
const admittedSeamProjection = (
  run: BackgroundJob["run"],
  signal: AbortSignal
) =>
  new Promise<Projection | null>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const job: BackgroundJob = {
      run,
      signal,
      resolve: (result) => {
        cleanup();
        resolve(result);
      },
      reject: (error) => {
        cleanup();
        reject(error);
      },
    };
    const abort = () => {
      const index = backgroundJobs.indexOf(job);
      if (index >= 0) backgroundJobs.splice(index, 1);
      job.reject(signal.reason);
      if (!backgroundJobs.length && backgroundRetry) {
        clearTimeout(backgroundRetry);
        backgroundRetry = null;
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    backgroundJobs.push(job);
    pumpBackground();
  });

/** One conversion per live tile; changes during work coalesce to the latest
 * generation. Finishing obsolete work avoids destroying a warm worker slot. */
export const createTerrainEcefSeamReprojection = (options: {
  version: () => string;
  publishedVersion: () => string;
  project: (signal: AbortSignal) => Promise<Projection>;
  publish: (projection: Projection, version: string) => void;
  onError: (error: unknown) => void;
}) => {
  let disposed = false;
  let active: {
    controller: AbortController;
    completion: Promise<void>;
  } | null = null;
  let retryAfter = 0;
  let failedVersion: string | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = 1000;
  const sync = () => {
    if (disposed || active || options.version() === options.publishedVersion())
      return;
    const version = options.version();
    if (version === failedVersion && performance.now() < retryAfter) return;
    if (version !== failedVersion) retryDelay = 1000;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    const controller = new AbortController();
    const job = { controller, completion: Promise.resolve() };
    active = job;
    const computation = admittedSeamProjection(
      () =>
        version === options.version()
          ? options.project(controller.signal)
          : Promise.resolve(null),
      controller.signal
    );
    job.completion = computation
      .then((projection) => {
        if (!projection) return;
        if (
          disposed ||
          controller.signal.aborted ||
          version !== options.version()
        ) {
          projection.geometry.dispose();
          return;
        }
        options.publish(projection, version);
        failedVersion = null;
      })
      .catch((error) => {
        if (!disposed && !controller.signal.aborted) {
          failedVersion = version;
          retryAfter = performance.now() + retryDelay;
          retryTimer = setTimeout(() => {
            retryTimer = null;
            sync();
          }, retryDelay);
          retryDelay = Math.min(30000, retryDelay * 2);
          if (
            !allocationFailed(error) ||
            performance.now() - allocationWarningAt >= 30000
          ) {
            if (allocationFailed(error))
              allocationWarningAt = performance.now();
            options.onError(error);
          }
        }
      })
      .finally(() => {
        if (active === job) active = null;
        if (!disposed && version !== options.version()) sync();
      });
  };
  return {
    sync,
    settled: async () => {
      while (active) await active.completion;
    },
    dispose: () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      active?.controller.abort();
    },
  };
};
