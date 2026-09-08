import type {
  CachedProjectedTerrainGeometry,
  CachedProjectedTerrainTile,
} from "./projected-terrain-cache-record";

export const PROJECTED_TERRAIN_MESHOPT_CODEC_VERSION =
  "projected-terrain-meshopt-v1";

// Match the existing projected-cache pending-write budget. Validate the whole
// record before allocating decoder outputs, not just each individual stream.
const MAX_DECODED_BYTES = 32 * 1024 ** 2;
const MAX_ENCODED_BYTES = 2 * MAX_DECODED_BYTES;
const RAW_MASK_THRESHOLD = 64;

const tileFloatFields = ["u", "v", "heightMeters"] as const;
const tileIndexFields = [
  "indices",
  "westIndices",
  "southIndices",
  "eastIndices",
  "northIndices",
] as const;
type TileArrayField =
  | (typeof tileFloatFields)[number]
  | (typeof tileIndexFields)[number];
type TerrainArray = Float32Array | Uint32Array | Uint8Array;
type EncodedTerrainStream = Readonly<{
  type: "float32" | "uint32" | "uint8";
  mode: "attributes" | "sequence" | "raw";
  count: number;
  stride: 4 | 12;
  data: Uint8Array;
}>;

export type EncodedProjectedTerrainTile = Readonly<{
  version: typeof PROJECTED_TERRAIN_MESHOPT_CODEC_VERSION;
  decodedByteLength: number;
  encodedByteLength: number;
  tile: Omit<CachedProjectedTerrainTile["tile"], TileArrayField> &
    Record<TileArrayField, EncodedTerrainStream>;
  geometry:
    | (Omit<
        CachedProjectedTerrainGeometry,
        "positions" | "normals" | "indices"
      > &
        Record<"positions" | "normals" | "indices", EncodedTerrainStream>)
    | null;
  reliefVertexMask: EncodedTerrainStream;
}>;

function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new Error("Invalid projected terrain Meshopt record");
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const validateMetadata = (
  tile:
    | CachedProjectedTerrainTile["tile"]
    | EncodedProjectedTerrainTile["tile"],
  geometry:
    | CachedProjectedTerrainGeometry
    | EncodedProjectedTerrainTile["geometry"]
) => {
  requireValid(isObject(tile) && isObject(tile.id) && isObject(tile.bounds));
  requireValid(
    [tile.id.level, tile.id.x, tile.id.y].every(Number.isSafeInteger) &&
      tile.id.level >= 0 &&
      tile.id.x >= 0 &&
      tile.id.y >= 0 &&
      [
        tile.bounds.west,
        tile.bounds.south,
        tile.bounds.east,
        tile.bounds.north,
        tile.minimumHeightMeters,
        tile.maximumHeightMeters,
        tile.geometricErrorMeters,
        tile.byteLength,
      ].every(Number.isFinite)
  );
  if (geometry !== null) {
    requireValid(isObject(geometry));
    requireValid(
      Array.isArray(geometry.bounds) &&
        geometry.bounds.length === 6 &&
        geometry.bounds.every(Number.isFinite) &&
        Array.isArray(geometry.sphere) &&
        geometry.sphere.length === 4 &&
        geometry.sphere.every(Number.isFinite) &&
        geometry.sphere[3] >= 0
    );
  }
};

const validateIndices = (indices: Uint32Array, vertexCount: number) => {
  for (const index of indices) requireValid(index < vertexCount);
};

const recordArrays = (record: CachedProjectedTerrainTile): TerrainArray[] => [
  ...tileFloatFields.map((field) => record.tile[field]),
  ...tileIndexFields.map((field) => record.tile[field]),
  ...(record.geometry
    ? [
        record.geometry.positions,
        record.geometry.normals,
        record.geometry.indices,
      ]
    : []),
  record.reliefVertexMask,
];

const validateRecord = (record: CachedProjectedTerrainTile) => {
  requireValid(isObject(record));
  validateMetadata(record.tile, record.geometry);
  for (const field of tileFloatFields)
    requireValid(record.tile[field] instanceof Float32Array);
  for (const field of tileIndexFields)
    requireValid(record.tile[field] instanceof Uint32Array);
  requireValid(record.reliefVertexMask instanceof Uint8Array);
  const vertexCount = record.tile.u.length;
  requireValid(
    record.tile.v.length === vertexCount &&
      record.tile.heightMeters.length === vertexCount &&
      record.reliefVertexMask.length === vertexCount
  );
  if (record.geometry) {
    const { positions, normals, indices } = record.geometry;
    requireValid(
      positions instanceof Float32Array &&
        normals instanceof Float32Array &&
        indices instanceof Uint32Array &&
        positions.length > 0 &&
        positions.length % 3 === 0 &&
        positions.length === normals.length &&
        indices.length > 0 &&
        indices.length % 3 === 0
    );
  }
  const bytes = recordArrays(record).reduce(
    (sum, array) => sum + array.byteLength,
    0
  );
  requireValid(bytes <= MAX_DECODED_BYTES);
  for (const field of tileIndexFields)
    validateIndices(record.tile[field], vertexCount);
  if (record.geometry)
    validateIndices(
      record.geometry.indices,
      record.geometry.positions.length / 3
    );
  return bytes;
};

const validatePayload = (value: unknown): EncodedProjectedTerrainTile => {
  requireValid(isObject(value));
  const payload = value as unknown as EncodedProjectedTerrainTile;
  requireValid(payload.version === PROJECTED_TERRAIN_MESHOPT_CODEC_VERSION);
  validateMetadata(payload.tile, payload.geometry);
  let decodedBytes = 0;
  let encodedBytes = 0;
  const check = (
    stream: EncodedTerrainStream,
    type: EncodedTerrainStream["type"],
    stride: 4 | 12
  ) => {
    requireValid(isObject(stream));
    requireValid(
      stream.type === type &&
        stream.stride === stride &&
        Number.isSafeInteger(stream.count) &&
        stream.count >= 0 &&
        stream.count <= MAX_DECODED_BYTES / stride &&
        stream.data instanceof Uint8Array
    );
    const bytes = stream.count * (type === "uint8" ? 1 : stride);
    decodedBytes += bytes;
    encodedBytes += stream.data.byteLength;
    requireValid(
      decodedBytes <= MAX_DECODED_BYTES && encodedBytes <= MAX_ENCODED_BYTES
    );
    if (stream.mode === "raw") {
      requireValid(
        (stream.count === 0 ||
          (type === "uint8" && stream.count < RAW_MASK_THRESHOLD)) &&
          stream.data.byteLength === bytes
      );
    } else {
      requireValid(
        stream.count > 0 &&
          stream.data.byteLength > 0 &&
          stream.data.byteLength <= stream.count * stride * 2 + 1024 &&
          stream.mode === (type === "uint32" ? "sequence" : "attributes") &&
          stream.data[0] === (type === "uint32" ? 0xd1 : 0xa1)
      );
    }
  };
  for (const field of tileFloatFields) check(payload.tile[field], "float32", 4);
  for (const field of tileIndexFields) check(payload.tile[field], "uint32", 4);
  check(payload.reliefVertexMask, "uint8", 4);
  requireValid(
    payload.tile.u.count === payload.tile.v.count &&
      payload.tile.u.count === payload.tile.heightMeters.count &&
      payload.tile.u.count === payload.reliefVertexMask.count
  );
  if (payload.geometry) {
    const geometry = payload.geometry;
    check(geometry.positions, "float32", 12);
    check(geometry.normals, "float32", 12);
    check(geometry.indices, "uint32", 4);
    requireValid(
      geometry.positions.count > 0 &&
        geometry.positions.count === geometry.normals.count &&
        geometry.indices.count > 0 &&
        geometry.indices.count % 3 === 0
    );
  }
  requireValid(
    payload.decodedByteLength === decodedBytes &&
      payload.encodedByteLength === encodedBytes
  );
  return payload;
};

const bytesOf = (array: TerrainArray) =>
  new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

/** Byte-preserving codec only: no filtering, quantization, triangle rotation or
 * vertex reordering. Loading this module does not instantiate either WASM module.
 */
export const encodeProjectedTerrainMeshoptRecord = async (
  record: CachedProjectedTerrainTile
): Promise<EncodedProjectedTerrainTile> => {
  validateRecord(record);
  const { MeshoptEncoder } = await import(
    "meshoptimizer/meshopt_encoder.module.js"
  );
  requireValid(MeshoptEncoder.supported);
  await MeshoptEncoder.ready;
  const decodedByteLength = validateRecord(record);
  let encodedByteLength = 0;
  const encode = (
    array: TerrainArray,
    type: EncodedTerrainStream["type"],
    stride: 4 | 12
  ): EncodedTerrainStream => {
    const count = type === "uint8" ? array.length : array.byteLength / stride;
    let mode: EncodedTerrainStream["mode"];
    let data: Uint8Array;
    if (count === 0 || (type === "uint8" && count < RAW_MASK_THRESHOLD)) {
      mode = "raw";
      data = bytesOf(array).slice();
    } else if (type === "uint32") {
      mode = "sequence";
      data = MeshoptEncoder.encodeIndexSequence(bytesOf(array), count, 4);
    } else {
      mode = "attributes";
      let source = bytesOf(array);
      if (type === "uint8") {
        source = new Uint8Array(count * 4);
        for (let index = 0; index < count; index++)
          source[index * 4] = array[index];
      }
      data = MeshoptEncoder.encodeVertexBufferLevel(
        source,
        count,
        stride,
        0,
        1
      );
    }
    encodedByteLength += data.byteLength;
    return { type, mode, count, stride, data };
  };
  const tile = {
    ...record.tile,
    id: { ...record.tile.id },
    bounds: { ...record.tile.bounds },
    u: encode(record.tile.u, "float32", 4),
    v: encode(record.tile.v, "float32", 4),
    heightMeters: encode(record.tile.heightMeters, "float32", 4),
    indices: encode(record.tile.indices, "uint32", 4),
    westIndices: encode(record.tile.westIndices, "uint32", 4),
    southIndices: encode(record.tile.southIndices, "uint32", 4),
    eastIndices: encode(record.tile.eastIndices, "uint32", 4),
    northIndices: encode(record.tile.northIndices, "uint32", 4),
  };
  const geometry = record.geometry
    ? {
        ...record.geometry,
        bounds: [...record.geometry.bounds],
        sphere: [...record.geometry.sphere],
        positions: encode(record.geometry.positions, "float32", 12),
        normals: encode(record.geometry.normals, "float32", 12),
        indices: encode(record.geometry.indices, "uint32", 4),
      }
    : null;
  const reliefVertexMask = encode(record.reliefVertexMask, "uint8", 4);
  return validatePayload({
    version: PROJECTED_TERRAIN_MESHOPT_CODEC_VERSION,
    decodedByteLength,
    encodedByteLength,
    tile,
    geometry,
    reliefVertexMask,
  });
};

export const decodeProjectedTerrainMeshoptRecord = async (
  value: unknown
): Promise<CachedProjectedTerrainTile> => {
  const payload = validatePayload(value);
  // The upstream decoder feature-detects WASM SIMD itself; no worker farm or
  // global decoder configuration is needed inside our existing terrain worker.
  const { MeshoptDecoder } = await import(
    "meshoptimizer/meshopt_decoder.module.js"
  );
  requireValid(MeshoptDecoder.supported);
  await MeshoptDecoder.ready;
  // The caller may hold mutable descriptors across the asynchronous module load.
  validatePayload(payload);
  const decode = (stream: EncodedTerrainStream): TerrainArray => {
    const target = new Uint8Array(
      stream.mode === "raw"
        ? stream.data.byteLength
        : stream.count * stream.stride
    );
    if (stream.mode === "raw") target.set(stream.data);
    else if (stream.mode === "sequence")
      MeshoptDecoder.decodeIndexSequence(target, stream.count, 4, stream.data);
    else
      MeshoptDecoder.decodeVertexBuffer(
        target,
        stream.count,
        stream.stride,
        stream.data
      );
    if (stream.type === "float32") return new Float32Array(target.buffer);
    if (stream.type === "uint32") return new Uint32Array(target.buffer);
    if (stream.mode === "raw") return target;
    const mask = new Uint8Array(stream.count);
    for (let index = 0; index < mask.length; index++)
      mask[index] = target[index * 4];
    return mask;
  };
  const record: CachedProjectedTerrainTile = {
    tile: {
      ...payload.tile,
      id: { ...payload.tile.id },
      bounds: { ...payload.tile.bounds },
      u: decode(payload.tile.u) as Float32Array,
      v: decode(payload.tile.v) as Float32Array,
      heightMeters: decode(payload.tile.heightMeters) as Float32Array,
      indices: decode(payload.tile.indices) as Uint32Array,
      westIndices: decode(payload.tile.westIndices) as Uint32Array,
      southIndices: decode(payload.tile.southIndices) as Uint32Array,
      eastIndices: decode(payload.tile.eastIndices) as Uint32Array,
      northIndices: decode(payload.tile.northIndices) as Uint32Array,
    },
    geometry: payload.geometry
      ? {
          ...payload.geometry,
          bounds: [...payload.geometry.bounds],
          sphere: [...payload.geometry.sphere],
          positions: decode(payload.geometry.positions) as Float32Array,
          normals: decode(payload.geometry.normals) as Float32Array,
          indices: decode(payload.geometry.indices) as Uint32Array,
        }
      : null,
    reliefVertexMask: decode(payload.reliefVertexMask) as Uint8Array,
  };
  validateRecord(record);
  return record;
};
