import type {
  AxisCellBounds,
  AxisCellCacheLimits,
  AxisCellCacheRuntimeResult,
  AxisCellQueryMetrics,
} from "./shared-three-axis-cell-cache";
import {
  axisCellGeometryKey,
  readAxisCell,
  writeAxisCell,
} from "./axis-cell-persistence";

export type AxisCellWorkerRequest =
  | { type: "init"; limits: AxisCellCacheLimits }
  | {
      type: "sites";
      geometry: Float64Array;
      generation: number;
      persistenceKey?: string;
    }
  | {
      type: "query";
      id: number;
      generation: number;
      bounds: AxisCellBounds | null;
    }
  | { type: "cancel"; id: number };
export type AxisCellWorkerResponse =
  | { type: "result"; id: number; result: AxisCellCacheRuntimeResult | null }
  | { type: "error"; id: number };

type Source = {
  index: number;
  planes: Float64Array | null;
  bounds: number[];
  corners: number[];
  angleError: number;
  unbounded: boolean;
};
type Node = {
  bounds: number[];
  centre: number[];
  radius: number;
  axis: number[];
  angle: number;
  unbounded: boolean;
  left?: Node;
  right?: Node;
  start: number;
  end: number;
};
type Cell = { indices: Uint32Array; bytes: number };
const ETA = 8 * 2 ** -23;
const GAMMA = (8 * Number.EPSILON) / (1 - 8 * Number.EPSILON);
const TURN_MARGIN = 1e-8;
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const length = (x: number, y: number, z: number) => Math.hypot(x, y, z);
const finite = (values: ArrayLike<number>) => {
  for (let index = 0; index < values.length; index++)
    if (!Number.isFinite(values[index])) return false;
  return true;
};
const empty = (box: AxisCellBounds) =>
  box[0] > box[3] || box[1] > box[4] || box[2] > box[5];

const enclosingSphere = (box: readonly number[]) => {
  const centre = [
    box[0] * 0.5 + box[3] * 0.5,
    box[1] * 0.5 + box[4] * 0.5,
    box[2] * 0.5 + box[5] * 0.5,
  ];
  const rawRadius =
    length(box[3] - box[0], box[4] - box[1], box[5] - box[2]) * 0.5;
  const coordinateMagnitude = Math.max(...box.map(Math.abs));
  // Include centre/difference/hypot rounding at the actual coordinate scale.
  const radius =
    rawRadius * (1 + GAMMA) + Math.sqrt(3) * GAMMA * coordinateMagnitude;
  return { centre, radius };
};

/** Inverse residual certification includes the same coefficient uncertainty as
 * permissive leaf supports. Uncertifiable projectors remain unbounded. */
const projectorCone = (matrix: readonly number[]) => {
  if (!finite(matrix)) return null;
  const t = [
    matrix[0],
    matrix[4],
    matrix[8],
    matrix[1],
    matrix[5],
    matrix[9],
    matrix[3],
    matrix[7],
    matrix[11],
  ];
  const b = [matrix[12], matrix[13], matrix[15]];
  const scales = [
    length(t[0], t[1], t[2]),
    length(t[3], t[4], t[5]),
    length(t[6], t[7], t[8]),
  ];
  if (scales.some((scale) => !(scale > 0) || !Number.isFinite(scale)))
    return null;
  const n = t.map((value, index) => value / scales[Math.floor(index / 3)]);
  const yz = [
    n[4] * n[8] - n[5] * n[7],
    n[5] * n[6] - n[3] * n[8],
    n[3] * n[7] - n[4] * n[6],
  ];
  const zx = [
    n[7] * n[2] - n[8] * n[1],
    n[8] * n[0] - n[6] * n[2],
    n[6] * n[1] - n[7] * n[0],
  ];
  const xy = [
    n[1] * n[5] - n[2] * n[4],
    n[2] * n[3] - n[0] * n[5],
    n[0] * n[4] - n[1] * n[3],
  ];
  const determinant = n[0] * yz[0] + n[1] * yz[1] + n[2] * yz[2];
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-8)
    return null;
  const inverse = new Array<number>(9);
  for (let row = 0; row < 3; row++) {
    inverse[row * 3] = yz[row] / (determinant * scales[0]);
    inverse[row * 3 + 1] = zx[row] / (determinant * scales[1]);
    inverse[row * 3 + 2] = xy[row] / (determinant * scales[2]);
  }
  if (!finite(inverse)) return null;
  let q = 0,
    inverseNorm = 0,
    matrixNorm = 0;
  for (let row = 0; row < 3; row++) {
    let residualSum = 0,
      inverseSum = 0,
      matrixSum = 0;
    for (let column = 0; column < 3; column++) {
      let value = 0,
        magnitude = 0;
      for (let k = 0; k < 3; k++) {
        const product = inverse[row * 3 + k] * t[k * 3 + column];
        value += product;
        magnitude += Math.abs(product);
      }
      const identity = row === column ? 1 : 0;
      residualSum +=
        Math.abs(identity - value) + GAMMA * (magnitude + identity);
      inverseSum += Math.abs(inverse[row * 3 + column]);
      matrixSum += Math.abs(t[row * 3 + column]);
    }
    q = Math.max(q, residualSum);
    inverseNorm = Math.max(inverseNorm, inverseSum);
    matrixNorm = Math.max(matrixNorm, matrixSum);
  }
  if (!(q <= 0.5)) return null;
  const bound = 2 * inverseNorm * (1 + GAMMA);
  const perturbation = bound * ETA * matrixNorm;
  if (!(perturbation < 0.5)) return null;
  const robustInverse = (bound / (1 - perturbation)) * (1 + GAMMA);
  const apex = [0, 0, 0];
  for (let row = 0; row < 3; row++)
    apex[row] = -(
      inverse[row * 3] * b[0] +
      inverse[row * 3 + 1] * b[1] +
      inverse[row * 3 + 2] * b[2]
    );
  if (!finite(apex)) return null;
  const residual = (
    vector: readonly number[],
    target: readonly number[],
    affine: boolean
  ) => {
    let rho = 0;
    for (let row = 0; row < 3; row++) {
      let value = 0,
        magnitude = 0;
      for (let column = 0; column < 3; column++) {
        const product = t[row * 3 + column] * vector[column];
        value += product;
        magnitude += Math.abs(product);
      }
      if (affine) {
        value += b[row];
        magnitude += Math.abs(b[row]);
      } else magnitude += Math.abs(target[row]);
      rho = Math.max(
        rho,
        Math.abs(value - target[row]) +
          GAMMA * magnitude +
          ETA * (magnitude + (affine ? 0 : Math.abs(target[row])))
      );
    }
    return rho * (1 + GAMMA);
  };
  const coordinateError = Math.max(
    0.001,
    robustInverse * residual(apex, [0, 0, 0], true)
  );
  const corners: number[] = [];
  let angleError = TURN_MARGIN;
  for (const u of [0, 1])
    for (const v of [0, 1]) {
      let hx = t[0] - u * t[6],
        hy = t[1] - u * t[7],
        hz = t[2] - u * t[8];
      let vx = t[3] - v * t[6],
        vy = t[4] - v * t[7],
        vz = t[5] - v * t[8];
      const hl = length(hx, hy, hz),
        vl = length(vx, vy, vz);
      if (!(hl > 0 && vl > 0)) return null;
      hx /= hl;
      hy /= hl;
      hz /= hl;
      vx /= vl;
      vy /= vl;
      vz /= vl;
      let x = hy * vz - hz * vy,
        y = hz * vx - hx * vz,
        z = hx * vy - hy * vx;
      const rayLength = length(x, y, z);
      if (!(rayLength > 1e-12)) return null;
      x /= rayLength;
      y /= rayLength;
      z /= rayLength;
      let forward = x * t[6] + y * t[7] + z * t[8];
      if (forward < 0) {
        x = -x;
        y = -y;
        z = -z;
        forward = -forward;
      }
      if (!(forward > 0)) return null;
      const scaled = [x / forward, y / forward, z / forward];
      const scaledLength = length(...(scaled as [number, number, number]));
      const error =
        Math.sqrt(3) * robustInverse * residual(scaled, [u, v, 1], false);
      const lowerLength = scaledLength * (1 - GAMMA);
      if (!(lowerLength > error) || !Number.isFinite(error)) return null;
      angleError = Math.max(
        angleError,
        Math.asin(Math.min(1, error / lowerLength)) + TURN_MARGIN
      );
      corners.push(x, y, z);
    }
  if (!Number.isFinite(coordinateError) || !Number.isFinite(angleError))
    return null;
  return { apex, coordinateError, corners, angleError };
};

const prepareSource = (geometry: Float64Array, index: number): Source => {
  const offset = index * 19;
  const eye = [geometry[offset], geometry[offset + 1], geometry[offset + 2]];
  const matrix = Array.from(geometry.subarray(offset + 3, offset + 19));
  const planes = finite(matrix) ? new Float64Array(20) : null;
  if (planes)
    for (let column = 0; column < 4; column++) {
      const x = matrix[column * 4],
        y = matrix[column * 4 + 1],
        w = matrix[column * 4 + 3];
      planes[column] = x;
      planes[4 + column] = w - x;
      planes[8 + column] = y;
      planes[12 + column] = w - y;
      planes[16 + column] = w;
    }
  const raw = projectorCone(matrix);
  const rounded = projectorCone(matrix.map(Math.fround));
  const source: Source = {
    index,
    planes,
    bounds: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity],
    corners: [],
    angleError: 0,
    unbounded: !raw || !rounded,
  };
  const include = (point: readonly number[], error = 0) => {
    for (let axis = 0; axis < 3; axis++) {
      source.bounds[axis] = Math.min(source.bounds[axis], point[axis] - error);
      source.bounds[axis + 3] = Math.max(
        source.bounds[axis + 3],
        point[axis] + error
      );
    }
  };
  if (finite(eye)) include(eye);
  else source.unbounded = true;
  for (const cone of [raw, rounded])
    if (cone) {
      include(cone.apex, cone.coordinateError);
      source.corners.push(...cone.corners);
      source.angleError = Math.max(source.angleError, cone.angleError);
    }
  if (!finite(source.bounds)) source.bounds = [0, 0, 0, 0, 0, 0];
  return source;
};

const leafAdmits = (source: Source, box: AxisCellBounds) => {
  if (!source.planes) return true;
  const absX = Math.max(Math.abs(box[0]), Math.abs(box[3]));
  const absY = Math.max(Math.abs(box[1]), Math.abs(box[4]));
  const absZ = Math.max(Math.abs(box[2]), Math.abs(box[5]));
  for (let offset = 0; offset < 20; offset += 4) {
    const x = source.planes[offset],
      y = source.planes[offset + 1],
      z = source.planes[offset + 2],
      d = source.planes[offset + 3];
    const maximum =
      x * (x >= 0 ? box[3] : box[0]) +
      y * (y >= 0 ? box[4] : box[1]) +
      z * (z >= 0 ? box[5] : box[2]) +
      d;
    const magnitude =
      Math.abs(x) * absX +
      Math.abs(y) * absY +
      Math.abs(z) * absZ +
      Math.abs(d);
    if (maximum < -magnitude * ETA) return false;
  }
  return true;
};

/** Pure metadata backend; exported privately for Worker-unavailable environments
 * and focused tests. No terrain, distance shortlist, source depth or winner samples. */
export const createAxisCellCacheRuntime = (limits: AxisCellCacheLimits) => {
  let generation = 0,
    disposed = false,
    sources: Source[] = [],
    root: Node | undefined;
  let order = new Uint32Array();
  let ready = Promise.resolve();
  let stableKey: Promise<string | null> = Promise.resolve(null);
  let indexBytes = 0;
  const cells = new Map<string, Cell>();
  const current = (requested: number) => !disposed && requested === generation;
  const task = (canRun: () => boolean) => {
    let started = performance.now();
    return async () => {
      if (!canRun()) return false;
      if (performance.now() - started >= 4) {
        await pause();
        started = performance.now();
      }
      return canRun();
    };
  };
  const build = async (geometry: Float64Array, requested: number) => {
    const yieldIfNeeded = task(() => current(requested));
    const prepared: Source[] = [];
    for (let index = 0; index < geometry.length / 19; index++) {
      if (!(await yieldIfNeeded())) return;
      prepared.push(prepareSource(geometry, index));
    }
    if (!current(requested)) return;
    // Keep an in-flight build's ordering private. A newer geometry generation
    // can reset the published index while this one is paused at a yield.
    const buildingOrder = Uint32Array.from(prepared, (_, index) => index);
    const centre = (index: number, axis: number) =>
      (prepared[index].bounds[axis] + prepared[index].bounds[axis + 3]) * 0.5;
    const partition = async (
      start: number,
      end: number,
      median: number,
      axis: number
    ) => {
      let lo = start,
        hi = end - 1;
      while (lo < hi) {
        const pivot = centre(buildingOrder[(lo + hi) >>> 1], axis);
        let left = lo,
          right = hi;
        while (left <= right) {
          while (centre(buildingOrder[left], axis) < pivot) left++;
          while (centre(buildingOrder[right], axis) > pivot) right--;
          if (left <= right) {
            const value = buildingOrder[left];
            buildingOrder[left++] = buildingOrder[right];
            buildingOrder[right--] = value;
          }
          if (!(await yieldIfNeeded())) return false;
        }
        if (median <= right) hi = right;
        else if (median >= left) lo = left;
        else break;
      }
      return true;
    };
    const node = async (
      start: number,
      end: number
    ): Promise<Node | undefined> => {
      const bounds = [
        Infinity,
        Infinity,
        Infinity,
        -Infinity,
        -Infinity,
        -Infinity,
      ];
      let sx = 0,
        sy = 0,
        sz = 0,
        uncertainty = 0,
        unbounded = false;
      for (let at = start; at < end; at++) {
        if (!(await yieldIfNeeded())) return undefined;
        const source = prepared[buildingOrder[at]];
        for (let axis = 0; axis < 3; axis++) {
          bounds[axis] = Math.min(bounds[axis], source.bounds[axis]);
          bounds[axis + 3] = Math.max(
            bounds[axis + 3],
            source.bounds[axis + 3]
          );
        }
        unbounded ||= source.unbounded;
        uncertainty = Math.max(uncertainty, source.angleError);
        for (let corner = 0; corner < source.corners.length; corner += 3) {
          sx += source.corners[corner];
          sy += source.corners[corner + 1];
          sz += source.corners[corner + 2];
        }
      }
      const magnitude = length(sx, sy, sz);
      const axis =
        magnitude > 0
          ? [sx / magnitude, sy / magnitude, sz / magnitude]
          : [0, 0, 0];
      let minDot = 1;
      if (!unbounded && magnitude > 0)
        for (let at = start; at < end; at++) {
          if (!(await yieldIfNeeded())) return undefined;
          const corners = prepared[buildingOrder[at]].corners;
          for (let corner = 0; corner < corners.length; corner += 3)
            minDot = Math.min(
              minDot,
              axis[0] * corners[corner] +
                axis[1] * corners[corner + 1] +
                axis[2] * corners[corner + 2]
            );
        }
      const angle =
        Math.acos(Math.max(-1, Math.min(1, minDot))) +
        uncertainty +
        TURN_MARGIN;
      unbounded ||= !(magnitude > 0) || !(angle < Math.PI * 0.5);
      const sphere = enclosingSphere(bounds);
      const centreBox = sphere.centre,
        radius = sphere.radius;
      unbounded ||= !finite(centreBox) || !Number.isFinite(radius);
      const result: Node = {
        bounds,
        centre: centreBox,
        radius,
        axis,
        angle,
        unbounded,
        start,
        end,
      };
      if (end - start > 16) {
        let splitAxis = 0;
        for (let axis = 1; axis < 3; axis++)
          if (
            bounds[axis + 3] - bounds[axis] >
            bounds[splitAxis + 3] - bounds[splitAxis]
          )
            splitAxis = axis;
        const median = (start + end) >>> 1;
        if (!(await partition(start, end, median, splitAxis))) return undefined;
        result.left = await node(start, median);
        result.right = await node(median, end);
      }
      return result;
    };
    const built = prepared.length ? await node(0, prepared.length) : undefined;
    if (current(requested)) {
      sources = prepared;
      order = buildingOrder;
      root = built;
    }
  };
  const queryTree = async (
    box: AxisCellBounds,
    metrics: { bvhNodesVisited: number; leafSitesTested: number },
    canRun: () => boolean
  ) => {
    const yieldIfNeeded = task(canRun),
      found: number[] = [];
    const sphere = enclosingSphere(box);
    const centre = sphere.centre,
      radius = sphere.radius;
    const stack = root ? [root] : [];
    while (stack.length) {
      if (!(await yieldIfNeeded())) return null;
      const node = stack.pop()!;
      metrics.bvhNodesVisited++;
      if (!node.unbounded) {
        const x = centre[0] - node.centre[0],
          y = centre[1] - node.centre[1],
          z = centre[2] - node.centre[2];
        const distance = length(x, y, z);
        const subtractionError = length(
          GAMMA *
            (Math.abs(centre[0]) + Math.abs(node.centre[0]) + Math.abs(x)),
          GAMMA *
            (Math.abs(centre[1]) + Math.abs(node.centre[1]) + Math.abs(y)),
          GAMMA * (Math.abs(centre[2]) + Math.abs(node.centre[2]) + Math.abs(z))
        );
        const lowerDistance = distance * (1 - GAMMA);
        const combined = radius + node.radius + subtractionError + 0.001;
        if (
          Number.isFinite(lowerDistance) &&
          Number.isFinite(combined) &&
          lowerDistance > combined
        ) {
          const angle =
            node.angle +
            Math.asin(Math.min(1, combined / lowerDistance)) +
            TURN_MARGIN;
          const cosine =
            (x * node.axis[0] + y * node.axis[1] + z * node.axis[2]) / distance;
          if (
            Number.isFinite(cosine) &&
            angle < Math.PI &&
            cosine < Math.cos(angle) - TURN_MARGIN
          )
            continue;
        }
      }
      if (node.left && node.right) {
        stack.push(node.right, node.left);
        continue;
      }
      for (let at = node.start; at < node.end; at++) {
        if (!(await yieldIfNeeded())) return null;
        const source = sources[order[at]];
        metrics.leafSitesTested++;
        if (leafAdmits(source, box)) found.push(source.index);
      }
    }
    const result = Uint32Array.from(found);
    result.sort();
    return result;
  };
  const retain = (key: string, indices: Uint32Array) => {
    const bytes = indices.byteLength;
    if (bytes > limits.maxIndexBytes || !limits.maxCells) return;
    const previous = cells.get(key);
    if (previous) indexBytes -= previous.bytes;
    cells.delete(key);
    cells.set(key, { indices, bytes });
    indexBytes += bytes;
    while (cells.size > limits.maxCells || indexBytes > limits.maxIndexBytes) {
      const oldest = cells.entries().next().value!;
      cells.delete(oldest[0]);
      indexBytes -= oldest[1].bytes;
    }
  };
  return {
    setGeometry(
      geometry: Float64Array,
      nextGeneration: number,
      persistenceKey?: string
    ): void {
      generation = nextGeneration;
      root = undefined;
      sources = [];
      order = new Uint32Array();
      cells.clear();
      indexBytes = 0;
      stableKey = axisCellGeometryKey(
        persistenceKey,
        geometry,
        limits.cellSizeMeters
      );
      ready = build(geometry, nextGeneration);
    },
    async queryBounds(
      bounds: AxisCellBounds | null,
      isCurrent: () => boolean = () => true
    ): Promise<AxisCellCacheRuntimeResult | null> {
      const requested = generation,
        started = performance.now();
      const canRun = () => current(requested) && isCurrent();
      if (!canRun()) return null;
      await ready;
      if (!canRun()) return null;
      const durableKey = await stableKey;
      if (!canRun()) return null;
      const metrics = {
        generation: requested,
        sourceCount: sources.length,
        candidateCount: 0,
        cellCount: 0,
        cacheHits: 0,
        persistentHits: 0,
        cacheMisses: 0,
        fallback: false,
        bvhNodesVisited: 0,
        leafSitesTested: 0,
        indexBytes,
        elapsedMs: 0,
      } as {
        -readonly [Key in keyof AxisCellQueryMetrics]: AxisCellQueryMetrics[Key];
      };
      const finish = (indices: Uint32Array) => {
        metrics.candidateCount = indices.length;
        metrics.indexBytes = indexBytes;
        metrics.elapsedMs = performance.now() - started;
        return { indices, metrics };
      };
      if (!bounds || !finite(bounds)) {
        metrics.fallback = true;
        metrics.fallbackReason = "null-bounds";
        return finish(Uint32Array.from(sources, (_, index) => index));
      }
      if (empty(bounds)) return finish(new Uint32Array());
      const minimum = [0, 1, 2].map((axis) =>
        Math.floor(bounds[axis] / limits.cellSizeMeters)
      );
      const maximum = [0, 1, 2].map((axis) =>
        Math.floor(bounds[axis + 3] / limits.cellSizeMeters)
      );
      const count =
        (maximum[0] - minimum[0] + 1) *
        (maximum[1] - minimum[1] + 1) *
        (maximum[2] - minimum[2] + 1);
      const fallback = async (reason: "cell-budget" | "index-budget") => {
        metrics.fallback = true;
        metrics.fallbackReason = reason;
        const indices = await queryTree(bounds, metrics, canRun);
        return indices ? finish(indices) : null;
      };
      if (
        !minimum.every(Number.isSafeInteger) ||
        !maximum.every(Number.isSafeInteger) ||
        !Number.isSafeInteger(count) ||
        count > limits.maxCells ||
        !limits.maxIndexBytes
      )
        return fallback("cell-budget");
      const selected = new Set<number>();
      let requestedBytes = 0;
      const yieldIfNeeded = task(canRun);
      for (let x = minimum[0]; x <= maximum[0]; x++)
        for (let y = minimum[1]; y <= maximum[1]; y++)
          for (let z = minimum[2]; z <= maximum[2]; z++) {
            if (!(await yieldIfNeeded())) return null;
            const key = `${x}:${y}:${z}`;
            let cell = cells.get(key);
            metrics.cellCount++;
            if (cell) {
              metrics.cacheHits++;
              cells.delete(key);
              cells.set(key, cell);
            } else {
              const stored = durableKey
                ? await readAxisCell(`${durableKey}|${key}`, sources.length)
                : null;
              if (!canRun()) return null;
              let indices = stored;
              if (indices) {
                metrics.cacheHits++;
                metrics.persistentHits = (metrics.persistentHits ?? 0) + 1;
              } else {
                metrics.cacheMisses++;
                const size = limits.cellSizeMeters;
                indices = await queryTree(
                  [
                    x * size,
                    y * size,
                    z * size,
                    (x + 1) * size,
                    (y + 1) * size,
                    (z + 1) * size,
                  ],
                  metrics,
                  canRun
                );
                if (!indices) return null;
                if (durableKey && canRun())
                  void writeAxisCell(`${durableKey}|${key}`, indices);
              }
              cell = { indices, bytes: indices.byteLength };
              retain(key, indices);
            }
            requestedBytes += cell.bytes;
            if (requestedBytes > limits.maxIndexBytes)
              return fallback("index-budget");
            for (const index of cell.indices) selected.add(index);
          }
      if (!canRun()) return null;
      const indices = Uint32Array.from(selected);
      indices.sort();
      return finish(indices);
    },
    async warmNearby(bounds: AxisCellBounds, isCurrent: () => boolean) {
      if (!finite(bounds) || empty(bounds)) return;
      if (!(await stableKey) || !isCurrent()) return;
      const size = limits.cellSizeMeters;
      const cx = Math.floor((bounds[0] + bounds[3]) / (2 * size));
      const cy = Math.floor((bounds[1] + bounds[4]) / (2 * size));
      const cz = Math.floor((bounds[2] + bounds[5]) / (2 * size));
      if (![cx, cy, cz].every(Number.isSafeInteger)) return;
      // A bounded 5x5 horizontal neighborhood follows the current view at its
      // actual metric height. Foreground requests preempt this idle pass.
      for (let radius = 1; radius <= 2; radius++)
        for (let dx = -radius; dx <= radius; dx++)
          for (let dy = -radius; dy <= radius; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
            if (!isCurrent()) return;
            // A point at the centre quantizes to exactly one cell. Passing
            // inclusive cell edges would also request its neighbours.
            const x = (cx + dx + 0.5) * size;
            const y = (cy + dy + 0.5) * size;
            const z = (cz + 0.5) * size;
            await this.queryBounds([x, y, z, x, y, z], isCurrent);
            await pause();
          }
    },
    dispose(): void {
      disposed = true;
      generation++;
      root = undefined;
      sources = [];
      cells.clear();
      indexBytes = 0;
    },
  };
};

// This module is imported by the main client only for its cooperative fallback.
// Installing the message loop exclusively in an actual worker avoids side effects
// and avoids circular worker bundling through the client module.
const scope = globalThis as unknown as {
  document?: unknown;
  importScripts?: unknown;
  postMessage: (
    message: AxisCellWorkerResponse,
    transfer?: Transferable[]
  ) => void;
  onmessage: ((event: MessageEvent<AxisCellWorkerRequest>) => void) | null;
};
if (
  typeof scope.document === "undefined" &&
  typeof scope.importScripts === "function" &&
  typeof scope.postMessage === "function"
) {
  let runtime = createAxisCellCacheRuntime({
    cellSizeMeters: 64,
    maxCells: 2048,
    maxIndexBytes: 8 * 1024 * 1024,
  });
  let generation = 0,
    active = false,
    scheduled = false;
  let warmTimer: ReturnType<typeof setTimeout> | undefined;
  const jobs = new Map<
    number,
    {
      request: Extract<AxisCellWorkerRequest, { type: "query" }>;
      cancelled: boolean;
    }
  >();
  const queue: number[] = [];
  const schedule = () => {
    if (active || scheduled || !queue.length) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      void run();
    }, 0);
  };
  const run = async () => {
    const id = queue.shift();
    if (id === undefined) return;
    const job = jobs.get(id);
    if (!job) {
      schedule();
      return;
    }
    active = true;
    try {
      const result = await runtime.queryBounds(
        job.request.bounds,
        () => !job.cancelled && job.request.generation === generation
      );
      if (jobs.get(id) === job && !job.cancelled)
        scope.postMessage(
          { type: "result", id, result },
          result ? [result.indices.buffer as ArrayBuffer] : []
        );
      if (
        result &&
        !result.metrics.fallback &&
        job.request.bounds &&
        jobs.get(id) === job &&
        !job.cancelled
      ) {
        clearTimeout(warmTimer);
        const bounds = job.request.bounds;
        const requested = generation;
        warmTimer = setTimeout(() => {
          warmTimer = undefined;
          if (queue.length || requested !== generation) return;
          void runtime.warmNearby(
            bounds,
            () => requested === generation && queue.length === 0
          );
        }, 150);
      }
    } catch {
      if (jobs.get(id) === job && !job.cancelled)
        scope.postMessage({ type: "error", id });
    } finally {
      jobs.delete(id);
      active = false;
      schedule();
    }
  };
  scope.onmessage = (event) => {
    const request = event.data;
    if (request.type === "init") {
      runtime.dispose();
      runtime = createAxisCellCacheRuntime(request.limits);
      return;
    }
    if (request.type === "sites") {
      generation = request.generation;
      clearTimeout(warmTimer);
      for (const job of jobs.values()) job.cancelled = true;
      jobs.clear();
      queue.length = 0;
      runtime.setGeometry(request.geometry, generation, request.persistenceKey);
      return;
    }
    if (request.type === "cancel") {
      const job = jobs.get(request.id);
      if (job) job.cancelled = true;
      jobs.delete(request.id);
      return;
    }
    jobs.set(request.id, { request, cancelled: false });
    queue.push(request.id);
    schedule();
  };
}
