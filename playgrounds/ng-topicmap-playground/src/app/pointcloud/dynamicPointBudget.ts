export interface PointBudgetConsumer {
  loadedPoints: number;
  visible: boolean;
}

export const POINT_MEMORY_BUDGET_SOURCES = {
  JS_HEAP_LIMIT: "js-heap-limit",
  DEVICE_MEMORY: "device-memory",
  FALLBACK: "fallback",
} as const;

export type PointMemoryBudgetSource =
  (typeof POINT_MEMORY_BUDGET_SOURCES)[keyof typeof POINT_MEMORY_BUDGET_SOURCES];

export interface PointMemoryBudget {
  bytes: number;
  pointCapacity: number;
  source: PointMemoryBudgetSource;
}

export interface PointMemorySignals {
  jsHeapSizeLimitBytes?: number;
  deviceMemoryGiB?: number;
}

export interface SceneMemoryAllocation {
  pointBytes: number;
  pointCapacity: number;
  meshBytes: number;
  meshBytesPerLayer: number;
}

export interface SceneRequestAllocation {
  pointJobs: number;
  pointJobsByCloud: number[];
  meshJobs: number;
  meshJobsByLayer: number[];
}

export interface SceneRequestDemand {
  pointJobsByCloud: readonly number[];
  meshJobsByLayer: readonly number[];
  prioritizedMeshLayers?: readonly boolean[];
}

export interface PointMemoryChunk {
  positions: ArrayBufferView;
  colors: ArrayBufferView | null;
  fieldValues: Readonly<Record<string, ArrayBufferView>>;
  pointCount: number;
}

const OFFSCREEN_WEIGHT = 0.08;
const BUDGET_QUANTUM = 50_000;
const MEBIBYTE = 1024 ** 2;
const GIBIBYTE = 1024 ** 3;
const POINT_MEMORY_SHARE = 0.3;
const MINIMUM_POINT_MEMORY_BYTES = 192 * MEBIBYTE;
const FALLBACK_BROWSER_MEMORY_BYTES = 2 * GIBIBYTE;

/**
 * Conservative CPU + GPU working-set estimate used before a COPC has been
 * decoded. Actual usage is reported from the resident typed arrays below.
 */
export const ESTIMATED_POINT_MEMORY_BYTES = 80;

const normalizeBudget = (value: number): number =>
  Math.max(0, Math.floor(value));

const derivePointCapacity = (bytes: number): number =>
  bytes > 0
    ? Math.max(100_000, Math.floor(bytes / ESTIMATED_POINT_MEMORY_BYTES))
    : 0;

/** Derive a point-cloud working-set budget from browser/device capacity. */
export const derivePointMemoryBudget = (
  signals: PointMemorySignals
): PointMemoryBudget => {
  const heapLimit = signals.jsHeapSizeLimitBytes;
  const deviceBytes =
    signals.deviceMemoryGiB === undefined
      ? undefined
      : signals.deviceMemoryGiB * GIBIBYTE;
  const candidates = [heapLimit, deviceBytes].filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0
  );
  const availableBytes =
    candidates.length > 0
      ? Math.min(...candidates)
      : FALLBACK_BROWSER_MEMORY_BYTES;
  const source =
    heapLimit !== undefined && candidates.includes(heapLimit)
      ? POINT_MEMORY_BUDGET_SOURCES.JS_HEAP_LIMIT
      : deviceBytes !== undefined && candidates.includes(deviceBytes)
      ? POINT_MEMORY_BUDGET_SOURCES.DEVICE_MEMORY
      : POINT_MEMORY_BUDGET_SOURCES.FALLBACK;
  const bytes = Math.max(
    MINIMUM_POINT_MEMORY_BYTES,
    Math.floor(availableBytes * POINT_MEMORY_SHARE)
  );

  return {
    bytes,
    pointCapacity: derivePointCapacity(bytes),
    source,
  };
};

/**
 * Splits one bounded scene working set between the point-cloud pool and every
 * active 3D Tiles renderer. Point clouds share one adaptive pool; each mesh
 * gets an equal protected cache slice so neither asset type can consume the
 * other's complete allowance.
 */
export const deriveSceneMemoryAllocation = (
  totalBytes: number,
  activeCloudCount: number,
  activeMeshCount: number
): SceneMemoryAllocation => {
  const budget = normalizeBudget(totalBytes);
  const hasPointPool = normalizeBudget(activeCloudCount) > 0;
  const meshCount = normalizeBudget(activeMeshCount);
  const consumerCount = (hasPointPool ? 1 : 0) + meshCount;
  if (consumerCount === 0) {
    return {
      pointBytes: 0,
      pointCapacity: 0,
      meshBytes: 0,
      meshBytesPerLayer: 0,
    };
  }

  const pointBytes = hasPointPool ? Math.floor(budget / consumerCount) : 0;
  const meshBytes = meshCount > 0 ? budget - pointBytes : 0;
  const meshBytesPerLayer =
    meshCount > 0 ? Math.floor(meshBytes / meshCount) : 0;

  return {
    pointBytes,
    pointCapacity: derivePointCapacity(pointBytes),
    meshBytes,
    meshBytesPerLayer,
  };
};

/**
 * Shares one bounded request allowance between COPC and 3D Tiles. Mesh
 * requests have strict priority: while a visible mesh has demand, all slots
 * are assigned to 3D Tiles. COPC requests resume once the mesh queue is
 * drained. Within a type, slots are distributed round-robin.
 */
export const deriveSceneRequestAllocation = (
  totalJobs: number,
  demand: SceneRequestDemand
): SceneRequestAllocation => {
  const budget = normalizeBudget(totalJobs);
  const pointDemand = demand.pointJobsByCloud.map((jobs) =>
    Math.max(1, normalizeBudget(jobs))
  );
  const meshDemand = demand.meshJobsByLayer.map((jobs) => normalizeBudget(jobs));
  const pointDemandTotal = pointDemand.reduce((sum, value) => sum + value, 0);
  const meshDemandTotal = meshDemand.reduce((sum, value) => sum + value, 0);
  if (budget === 0 || pointDemandTotal + meshDemandTotal === 0) {
    return {
      pointJobs: 0,
      pointJobsByCloud: pointDemand.map(() => 0),
      meshJobs: 0,
      meshJobsByLayer: meshDemand.map(() => 0),
    };
  }

  if (meshDemandTotal > 0) {
    const meshJobs = Math.min(meshDemandTotal, budget);
    return {
      pointJobs: 0,
      pointJobsByCloud: pointDemand.map(() => 0),
      meshJobs,
      meshJobsByLayer: distribute(meshJobs, meshDemand),
    };
  }

  let pointJobs = Math.min(pointDemandTotal, budget);
  let meshJobs = 0;
  let remainingJobs = budget - pointJobs - meshJobs;
  const pointUnmet = () => pointDemandTotal - pointJobs;
  const meshUnmet = () => meshDemandTotal - meshJobs;
  while (remainingJobs > 0 && (pointUnmet() > 0 || meshUnmet() > 0)) {
    if (pointUnmet() >= meshUnmet() && pointUnmet() > 0) {
      pointJobs++;
    } else if (meshUnmet() > 0) {
      meshJobs++;
    } else {
      pointJobs++;
    }
    remainingJobs--;
  }

  function distribute(jobs: number, demands: readonly number[]): number[] {
    const allocations = demands.map(() => 0);
    let remaining = jobs;
    while (remaining > 0) {
      let granted = false;
      for (let index = 0; index < demands.length && remaining > 0; index++) {
        if (allocations[index] >= demands[index]) continue;
        allocations[index]++;
        remaining--;
        granted = true;
      }
      if (!granted) break;
    }
    return allocations;
  }

  return {
    pointJobs,
    pointJobsByCloud: distribute(pointJobs, pointDemand),
    meshJobs,
    meshJobsByLayer: distribute(meshJobs, meshDemand),
  };
};

/**
 * Estimates the resident point-cloud working set without relying on browser
 * heap APIs. Source arrays stay on the CPU while Three.js mirrors every
 * geometry attribute to the GPU.
 */
export const estimatePointChunkMemoryBytes = (
  chunk: PointMemoryChunk
): number => {
  const sourceBuffers = new Set<ArrayBufferLike>();
  const addSource = (view: ArrayBufferView | null) => {
    if (view) sourceBuffers.add(view.buffer);
  };
  addSource(chunk.positions);
  addSource(chunk.colors);
  Object.values(chunk.fieldValues).forEach(addSource);
  const sourceBytes = [...sourceBuffers].reduce(
    (sum, buffer) => sum + buffer.byteLength,
    0
  );

  const hasColors = chunk.colors !== null;
  const hasClassification = "classification" in chunk.fieldValues;
  const gpuBytesPerPoint = 12 + (hasColors ? 3 : 0) + 4 + 12 + 4;
  const rendererOnlyCpuBytesPerPoint = 4 + 12 + (hasClassification ? 0 : 4);

  return (
    sourceBytes +
    chunk.pointCount * (gpuBytesPerPoint + rendererOnlyCpuBytesPerPoint)
  );
};

/**
 * Distributes one scene-wide render budget over loaded clouds. Visible clouds
 * get first-class weight; off-screen clouds retain a coarse contribution so a
 * pan never starts from an empty scene.
 */
export const allocatePointBudget = (
  totalBudget: number,
  consumers: readonly PointBudgetConsumer[]
): number[] => {
  const allocations = consumers.map(() => 0);
  let remaining = normalizeBudget(totalBudget);
  let active = consumers
    .map((consumer, index) => ({
      capacity: normalizeBudget(consumer.loadedPoints),
      index,
      weight: consumer.visible ? 1 : OFFSCREEN_WEIGHT,
    }))
    .filter(({ capacity }) => capacity > 0);

  while (remaining > 0 && active.length > 0) {
    const weightSum = active.reduce((sum, entry) => sum + entry.weight, 0);
    const saturated = active.filter((entry) => {
      const proportional = (remaining * entry.weight) / weightSum;
      return proportional >= entry.capacity - allocations[entry.index];
    });

    if (saturated.length > 0) {
      const saturatedIndices = new Set(saturated.map(({ index }) => index));
      for (const entry of saturated) {
        const grant = entry.capacity - allocations[entry.index];
        allocations[entry.index] += grant;
        remaining -= grant;
      }
      active = active.filter(({ index }) => !saturatedIndices.has(index));
      continue;
    }

    const available = remaining;
    for (const entry of active) {
      const grant = Math.min(
        entry.capacity - allocations[entry.index],
        Math.floor((available * entry.weight) / weightSum)
      );
      allocations[entry.index] += grant;
      remaining -= grant;
    }

    const byPriority = [...active].sort((a, b) => b.weight - a.weight);
    while (remaining > 0) {
      const entry = byPriority.find(
        (candidate) => allocations[candidate.index] < candidate.capacity
      );
      if (!entry) break;
      allocations[entry.index]++;
      remaining--;
    }
    break;
  }

  return allocations;
};

/**
 * Slow feedback controller for the scene-wide render budget. The caller's
 * ceiling limits memory/upload pressure while the target frame rate controls
 * when detail is reduced or recovered.
 */
export const adaptPointBudget = (
  currentBudget: number,
  maximumBudget: number,
  frameTimeMilliseconds: number,
  targetFramesPerSecond: number,
  minimumBudget = 100_000
): number => {
  const maximum = normalizeBudget(maximumBudget);
  const minimum = Math.min(maximum, normalizeBudget(minimumBudget));
  const current = Math.min(maximum, Math.max(minimum, currentBudget));
  const targetFrameTime = 1_000 / Math.max(1, targetFramesPerSecond);
  const factor =
    frameTimeMilliseconds > targetFrameTime * 1.5
      ? 0.72
      : frameTimeMilliseconds > targetFrameTime * 1.15
      ? 0.86
      : frameTimeMilliseconds < targetFrameTime * 0.65
      ? 1.2
      : frameTimeMilliseconds < targetFrameTime * 0.85
      ? 1.08
      : 1;
  if (factor === 1) return current;

  const adjusted =
    factor < 1
      ? Math.floor((current * factor) / BUDGET_QUANTUM) * BUDGET_QUANTUM
      : Math.ceil((current * factor) / BUDGET_QUANTUM) * BUDGET_QUANTUM;
  return Math.min(maximum, Math.max(minimum, adjusted));
};
