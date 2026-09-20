import { createDerivedBufferCache } from "@carma-commons/utils";
import { prepareEqualLevelTerrainShell } from "./terrain-equal-level-boundaries";
import type { TerrainStitchInput } from "./terrain-boundary-stitch";

type Topology = Pick<TerrainStitchInput, "indices" | "boundaryEdges"> & {
  sourceIndices: Uint32Array;
  normalTargets: Uint32Array;
};
const VERSION = "equal-level-two-ring-topology-v1";
const READ_DEADLINE_MS = 8;
const RAM_BUDGET = 8 * 1024 * 1024;
const WRITE_BUDGET = 2 * 1024 * 1024;
const resident = new Map<string, Topology>();
let residentBytes = 0,
  pendingWriteBytes = 0;
let storePromise:
  | Promise<ReturnType<
      ReturnType<typeof createDerivedBufferCache>["register"]
    > | null>
  | undefined;
const arrays = (t: Topology) => [
  t.indices,
  t.sourceIndices,
  t.normalTargets,
  ...Object.values(t.boundaryEdges),
];
const bytes = (t: Topology) =>
  arrays(t).reduce((sum, a) => sum + a.byteLength, 0);
const digest = async (data: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");

const store = () =>
  (storePromise ??= (async () => {
    // This producer is a pure function with no runtime imports. Hash its actual
    // code, plus all topology inputs, rather than trusting mutable HMR URLs.
    // Height/projection changes cannot stale this cache: neither is persisted.
    const epoch = await digest(
      new TextEncoder().encode(
        VERSION + prepareEqualLevelTerrainShell.toString()
      )
    );
    const manager = createDerivedBufferCache({
      capacityBytes: 256 * 1024 * 1024,
      producerEpoch: `terrain-edge-topology:${epoch}`,
    });
    return manager.register("terrain-edge-topology", VERSION);
  })().catch(() => null));

export const terrainEdgeTopologyKey = async (input: TerrainStitchInput) => {
  const values = [
    input.indices,
    input.boundaryEdges.west,
    input.boundaryEdges.east,
    input.boundaryEdges.north,
    input.boundaryEdges.south,
  ];
  const header = new Uint32Array([
    input.positions.length / 3,
    input.indices.BYTES_PER_ELEMENT,
    ...values.map((v) => v.length),
  ]);
  const data = new Uint8Array(
    header.byteLength + values.reduce((sum, v) => sum + v.byteLength, 0)
  );
  data.set(new Uint8Array(header.buffer));
  let offset = header.byteLength;
  for (const value of values) {
    data.set(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
      offset
    );
    offset += value.byteLength;
  }
  return digest(data);
};
const valid = (
  value: unknown,
  input: TerrainStitchInput
): value is Topology => {
  if (!value || typeof value !== "object") return false;
  const t = value as Topology;
  if (
    !(t.sourceIndices instanceof Uint32Array) ||
    !(t.normalTargets instanceof Uint32Array) ||
    !(t.indices instanceof Uint32Array) ||
    t.indices.length % 3 ||
    !t.boundaryEdges
  )
    return false;
  const count = t.sourceIndices.length;
  for (let i = 0; i < count; i++)
    if (
      t.sourceIndices[i] >= input.positions.length / 3 ||
      (i > 0 && t.sourceIndices[i] <= t.sourceIndices[i - 1])
    )
      return false;
  if ([...t.indices, ...t.normalTargets].some((i) => i >= count)) return false;
  for (const side of ["west", "east", "north", "south"] as const) {
    const edge = t.boundaryEdges[side],
      original = input.boundaryEdges[side];
    if (
      !(edge instanceof Uint32Array) ||
      edge.length !== original.length ||
      edge.some((i, j) => i >= count || t.sourceIndices[i] !== original[j])
    )
      return false;
  }
  return true;
};
const remember = (key: string, value: Topology) => {
  const old = resident.get(key);
  if (old) residentBytes -= bytes(old);
  resident.delete(key);
  resident.set(key, value);
  residentBytes += bytes(value);
  while (residentBytes > RAM_BUDGET || resident.size > 64) {
    const first = resident.keys().next().value!;
    residentBytes -= bytes(resident.get(first)!);
    resident.delete(first);
  }
};
const restore = (
  input: TerrainStitchInput,
  t: Topology
): TerrainStitchInput => {
  const positions = new Float32Array(t.sourceIndices.length * 3),
    normals = new Float32Array(positions.length);
  t.sourceIndices.forEach((source, i) => {
    positions.set(input.positions.subarray(source * 3, source * 3 + 3), i * 3);
    normals.set(input.normals.subarray(source * 3, source * 3 + 3), i * 3);
  });
  // Result buffers transfer to the main thread; never detach the resident atlas.
  return {
    ...input,
    positions,
    normals,
    indices: t.indices.slice(),
    sourceIndices: t.sourceIndices.slice(),
    normalTargets: t.normalTargets.slice(),
    boundaryEdges: {
      west: t.boundaryEdges.west.slice(),
      east: t.boundaryEdges.east.slice(),
      north: t.boundaryEdges.north.slice(),
      south: t.boundaryEdges.south.slice(),
    },
  };
};

// Decision: persist reusable topology, not origin-dependent mesh attributes.
// See ../../../../TERRAIN_GENERATION.md#persistent-edge-atlas.
/** Persist only the reusable edge atlas. Disk failures never prevent meshing. */
export const prepareCachedEqualLevelTerrainShell = async (
  input: TerrainStitchInput
): Promise<TerrainStitchInput> => {
  let key: string;
  try {
    key = await terrainEdgeTopologyKey(input);
  } catch {
    return prepareEqualLevelTerrainShell(input);
  }
  const memory = resident.get(key);
  if (memory) {
    remember(key, memory);
    return restore(input, memory);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = (async () => {
      const cache = await store();
      const record = await cache?.get<unknown>(key);
      return record?.value;
    })();
    const cached = await Promise.race([
      read,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), READ_DEADLINE_MS);
      }),
    ]);
    if (valid(cached, input)) {
      remember(key, cached);
      return restore(input, cached);
    }
  } catch {
    /* Source geometry remains authoritative. */
  } finally {
    clearTimeout(timer);
  }
  const shell = prepareEqualLevelTerrainShell(input);
  const topology: Topology = {
    indices: shell.indices as Uint32Array,
    sourceIndices: shell.sourceIndices!,
    normalTargets: shell.normalTargets!,
    boundaryEdges: shell.boundaryEdges,
  };
  // Keep a private atlas copy before transferring the newly prepared shell.
  const saved = structuredClone(topology);
  remember(key, saved);
  const size = bytes(saved);
  if (pendingWriteBytes + size <= WRITE_BUDGET) {
    pendingWriteBytes += size;
    void store()
      .then((cache) => cache?.put(key, saved, { bytes: size }))
      .catch(() => {})
      .finally(() => {
        pendingWriteBytes -= size;
      });
  }
  return shell;
};
