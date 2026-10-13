export type PhotoGapRepairNearestInput = Readonly<{
  /** Fixed ENU xyz in metres; w > 0 marks geometry present in this raster. */
  positions: Float32Array | null;
  /** Unmodified photograph RGBA. Only its nonzero alpha supplies donors. */
  photograph: Uint8Array | null;
  width: number;
  height: number;
  radiusMeters?: number;
  planeToleranceMeters?: number;
  normalDotThreshold?: number;
  /** Restrict missing receivers to positions.w >= 1.5; retain all real donors/surfaces. */
  intersectionOnly?: boolean;
}>;

export type PhotoGapRepairNearestResult = Readonly<{
  /** Little endian uint16 (x + 1, y + 1); all zero means no donor. */
  donorCoordinates: Uint8Array;
  /** Two RGBA planes: surface ENU xyz + valid first, then actual donor ENU xyz
   * + valid for repaired receivers only. Invalid/unrepaired entries are zero. */
  surfaceAndDonorPositions: Float32Array;
  /** Raster index of the original donor, or -1. */
  donorIndices: Int32Array;
  statistics: Readonly<{
    validPixels: number;
    donorPixels: number;
    missingPixels: number;
    repairedPixels: number;
    unresolvedPixels: number;
    surfaceComponents: number;
    normalPixels: number;
  }>;
}>;

export type PhotoGapRepairRequest = Readonly<{
  id: number;
  input: PhotoGapRepairNearestInput;
}>;

export type PhotoGapRepairReply =
  | Readonly<{ id: number; result: PhotoGapRepairNearestResult }>
  | Readonly<{ id: number; error: { name: string; message: string } }>;

const parameter = (value: number, name: string, maximum = Infinity) => {
  if (!Number.isFinite(value) || value < 0 || value > maximum)
    throw new RangeError(`${name} is outside its supported range`);
  return value;
};

/** Exact world-distance repair within a connected, locally coplanar surface.
 * This produces a lookup only. It never modifies raw pixels or promotes fills
 * into donors. Unreconstructable normals conservatively isolate that pixel. */
export const repairPhotoGapsNearest = (
  input: PhotoGapRepairNearestInput | null | undefined
): PhotoGapRepairNearestResult => {
  const width = input?.width ?? 0;
  const height = input?.height ?? 0;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 0 ||
    height < 0 ||
    width > 65535 ||
    height > 65535 ||
    // Fixed repair pages are small. Reject malformed dimensions before allocating
    // several dense scratch arrays (the worker integration currently uses256²).
    width * height > 1024 * 1024
  )
    throw new RangeError("Raster dimensions cannot be represented safely");
  const radius = parameter(input?.radiusMeters ?? 20, "radiusMeters");
  const tolerance = parameter(
    input?.planeToleranceMeters ?? 0.25,
    "planeToleranceMeters"
  );
  const similarity = parameter(
    input?.normalDotThreshold ?? 0.98,
    "normalDotThreshold",
    1
  );
  const count = width * height;
  const donorCoordinates = new Uint8Array(count * 4);
  const surfaceAndDonorPositions = new Float32Array(count * 8);
  const donorIndices = new Int32Array(count).fill(-1);
  const statistics = {
    validPixels: 0,
    donorPixels: 0,
    missingPixels: 0,
    repairedPixels: 0,
    unresolvedPixels: 0,
    surfaceComponents: 0,
    normalPixels: 0,
  };
  const result = {
    donorCoordinates,
    surfaceAndDonorPositions,
    donorIndices,
    statistics,
  };
  const positions = input?.positions;
  const photograph = input?.photograph;
  const intersectionOnly = input?.intersectionOnly === true;
  if (!count || !positions) return result;

  const valid = new Uint8Array(count);
  const normals = new Float64Array(count * 3);
  const parents = new Int32Array(count).fill(-1);
  const sizes = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    if (
      positions[p + 3] > 0 &&
      Number.isFinite(positions[p + 3]) &&
      Number.isFinite(positions[p]) &&
      Number.isFinite(positions[p + 1]) &&
      Number.isFinite(positions[p + 2])
    ) {
      valid[i] = 1;
      surfaceAndDonorPositions[p] = positions[p];
      surfaceAndDonorPositions[p + 1] = positions[p + 1];
      surfaceAndDonorPositions[p + 2] = positions[p + 2];
      surfaceAndDonorPositions[p + 3] = 1;
      parents[i] = i;
      sizes[i] = 1;
      statistics.validPixels++;
    }
  }

  // Candidate planes use adjacent real positions, not image colour. Select the
  // best supported plane instead of averaging roof and facade across a corner.
  const vectors = new Float64Array(24);
  for (let i = 0; i < count; i++) {
    if (!valid[i]) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    let neighbors = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const j = ny * width + nx;
        if (!valid[j]) continue;
        for (let axis = 0; axis < 3; axis++)
          vectors[neighbors * 3 + axis] =
            positions[j * 4 + axis] - positions[i * 4 + axis];
        neighbors++;
      }
    let bestSupport = 0;
    let bestError = Infinity;
    for (let a = 0; a < neighbors; a++)
      for (let b = a + 1; b < neighbors; b++) {
        const ax = vectors[a * 3],
          ay = vectors[a * 3 + 1],
          az = vectors[a * 3 + 2];
        const bx = vectors[b * 3],
          by = vectors[b * 3 + 1],
          bz = vectors[b * 3 + 2];
        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const length = Math.hypot(nx, ny, nz);
        if (length <= 1e-10 * Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz))
          continue;
        nx /= length;
        ny /= length;
        nz /= length;
        let support = 0;
        let error = 0;
        for (let k = 0; k < neighbors; k++) {
          const deviation = Math.abs(
            nx * vectors[k * 3] +
              ny * vectors[k * 3 + 1] +
              nz * vectors[k * 3 + 2]
          );
          if (deviation <= tolerance) {
            support++;
            error += deviation;
          }
        }
        if (
          support < bestSupport ||
          (support === bestSupport && error >= bestError)
        )
          continue;
        bestSupport = support;
        bestError = error;
        normals[i * 3] = nx;
        normals[i * 3 + 1] = ny;
        normals[i * 3 + 2] = nz;
      }
    if (bestSupport >= 2) statistics.normalPixels++;
    else normals.fill(0, i * 3, i * 3 + 3);
  }

  const root = (i: number): number => {
    let r = i;
    while (parents[r] !== r) r = parents[r];
    while (parents[i] !== i) {
      const next = parents[i];
      parents[i] = r;
      i = next;
    }
    return r;
  };
  const compatiblePlanes = (a: number, b: number): boolean => {
    const ai = a * 3,
      bi = b * 3;
    const dot =
      normals[ai] * normals[bi] +
      normals[ai + 1] * normals[bi + 1] +
      normals[ai + 2] * normals[bi + 2];
    // Local cross products have no absolute orientation. Align their sign before
    // applying the normal-dot threshold; a facade still differs by 90 degrees.
    const lengthA = Math.hypot(normals[ai], normals[ai + 1], normals[ai + 2]);
    const lengthB = Math.hypot(normals[bi], normals[bi + 1], normals[bi + 2]);
    if (lengthA < 0.5 || lengthB < 0.5 || Math.abs(dot) < similarity)
      return false;
    const dx = positions[b * 4] - positions[a * 4];
    const dy = positions[b * 4 + 1] - positions[a * 4 + 1];
    const dz = positions[b * 4 + 2] - positions[a * 4 + 2];
    return (
      Math.abs(
        normals[ai] * dx + normals[ai + 1] * dy + normals[ai + 2] * dz
      ) <= tolerance &&
      Math.abs(
        normals[bi] * dx + normals[bi + 1] * dy + normals[bi + 2] * dz
      ) <= tolerance
    );
  };
  const connect = (a: number, b: number) => {
    if (!valid[a] || !valid[b] || !compatiblePlanes(a, b)) return;
    let ra = root(a),
      rb = root(b);
    if (ra === rb) return;
    if (sizes[ra] < sizes[rb]) [ra, rb] = [rb, ra];
    parents[rb] = ra;
    sizes[ra] += sizes[rb];
  };
  for (let i = 0; i < count; i++) {
    if ((i % width) + 1 < width) connect(i, i + 1);
    if (i + width < count) connect(i, i + width);
  }

  const components = new Set<number>();
  const donors = new Map<number, number[]>();
  const publish = (pixel: number, donor: number) => {
    donorIndices[pixel] = donor;
    const x = (donor % width) + 1;
    const y = Math.floor(donor / width) + 1;
    donorCoordinates[pixel * 4] = x & 255;
    donorCoordinates[pixel * 4 + 1] = x >>> 8;
    donorCoordinates[pixel * 4 + 2] = y & 255;
    donorCoordinates[pixel * 4 + 3] = y >>> 8;
  };
  for (let i = 0; i < count; i++) {
    if (!valid[i]) continue;
    const component = root(i);
    components.add(component);
    if ((photograph?.[i * 4 + 3] ?? 0) > 0) {
      const list = donors.get(component);
      if (list) list.push(i);
      else donors.set(component, [i]);
      statistics.donorPixels++;
      publish(i, i);
    } else if (!intersectionOnly || positions[i * 4 + 3] >= 1.5)
      statistics.missingPixels++;
  }
  statistics.surfaceComponents = components.size;

  // A balanced kd-tree is stored implicitly in each component's donor array.
  // In-place median selection avoids per-node arrays and repeated full sorting.
  const compare = (a: number, b: number, axis: number) =>
    positions[a * 4 + axis] - positions[b * 4 + axis] || a - b;
  const select = (
    values: number[],
    left: number,
    right: number,
    k: number,
    axis: number
  ) => {
    while (left < right) {
      const pivot = values[(left + right) >>> 1];
      let lo = left,
        hi = right;
      while (lo <= hi) {
        while (compare(values[lo], pivot, axis) < 0) lo++;
        while (compare(values[hi], pivot, axis) > 0) hi--;
        if (lo <= hi) {
          [values[lo], values[hi]] = [values[hi], values[lo]];
          lo++;
          hi--;
        }
      }
      if (k <= hi) right = hi;
      else if (k >= lo) left = lo;
      else return;
    }
  };
  const build = (values: number[], lo: number, hi: number, depth: number) => {
    if (lo >= hi) return;
    const mid = (lo + hi) >>> 1;
    select(values, lo, hi - 1, mid, depth % 3);
    build(values, lo, mid, depth + 1);
    build(values, mid + 1, hi, depth + 1);
  };
  for (const values of donors.values()) build(values, 0, values.length, 0);

  for (let i = 0; i < count; i++) {
    if (
      !valid[i] ||
      donorIndices[i] >= 0 ||
      (intersectionOnly && positions[i * 4 + 3] < 1.5)
    )
      continue;
    const values = donors.get(root(i));
    if (!values) continue;
    let nearest = -1;
    let distanceSquared = radius * radius;
    const search = (lo: number, hi: number, depth: number) => {
      if (lo >= hi) return;
      const mid = (lo + hi) >>> 1;
      const donor = values[mid];
      const dx = positions[donor * 4] - positions[i * 4];
      const dy = positions[donor * 4 + 1] - positions[i * 4 + 1];
      const dz = positions[donor * 4 + 2] - positions[i * 4 + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (
        (d < distanceSquared ||
          (d === distanceSquared && (nearest < 0 || donor < nearest))) &&
        // A chain of locally similar planes may turn through a curved surface.
        // Its endpoints must still satisfy the original plane/normal contract.
        compatiblePlanes(i, donor)
      ) {
        nearest = donor;
        distanceSquared = d;
      }
      const delta =
        positions[i * 4 + (depth % 3)] - positions[donor * 4 + (depth % 3)];
      if (delta <= 0) {
        search(lo, mid, depth + 1);
        if (delta * delta <= distanceSquared) search(mid + 1, hi, depth + 1);
      } else {
        search(mid + 1, hi, depth + 1);
        if (delta * delta <= distanceSquared) search(lo, mid, depth + 1);
      }
    };
    search(0, values.length, 0);
    if (nearest >= 0) {
      publish(i, nearest);
      const donorPosition = count * 4 + i * 4;
      surfaceAndDonorPositions[donorPosition] = positions[nearest * 4];
      surfaceAndDonorPositions[donorPosition + 1] = positions[nearest * 4 + 1];
      surfaceAndDonorPositions[donorPosition + 2] = positions[nearest * 4 + 2];
      surfaceAndDonorPositions[donorPosition + 3] = 1;
      statistics.repairedPixels++;
    }
  }
  statistics.unresolvedPixels =
    statistics.missingPixels - statistics.repairedPixels;
  return result;
};
