// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import type { CachedProjectedTerrainTile } from "./projected-terrain-cache-record";
import {
  decodeProjectedTerrainMeshoptRecord,
  encodeProjectedTerrainMeshoptRecord,
  PROJECTED_TERRAIN_MESHOPT_CODEC_VERSION,
  type EncodedProjectedTerrainTile,
} from "./projected-terrain-meshopt-codec";

// Importing a codec must not initialize the cache backend or scene modules.
vi.mock("./projected-terrain-cache-record", () => {
  throw new Error("The codec must only import cache record types");
});
const moduleLoads = vi.hoisted(() => ({ encoder: 0, decoder: 0 }));
vi.mock("meshoptimizer/meshopt_encoder.module.js", async (importOriginal) => {
  moduleLoads.encoder++;
  return importOriginal<
    typeof import("meshoptimizer/meshopt_encoder.module.js")
  >();
});
vi.mock("meshoptimizer/meshopt_decoder.module.js", async (importOriginal) => {
  moduleLoads.decoder++;
  return importOriginal<
    typeof import("meshoptimizer/meshopt_decoder.module.js")
  >();
});

afterEach(() => vi.restoreAllMocks());

type TerrainArray = Float32Array | Uint32Array | Uint8Array;
const bytesOf = (array: TerrainArray) =>
  new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

const subview = <T extends TerrainArray>(array: T): T => {
  const storage = new Uint8Array(array.byteLength + 16).fill(0xcd);
  storage.set(bytesOf(array), 8);
  const Constructor = array.constructor as {
    new (buffer: ArrayBuffer, byteOffset: number, length: number): T;
  };
  return new Constructor(storage.buffer, 8, array.length);
};

const fixture = (vertexCount = 96): CachedProjectedTerrainTile => {
  const tile = {
    id: { level: 12, x: 2129, y: 1364 },
    bounds: { west: 7.1, south: 51.2, east: 7.2, north: 51.3 },
    u: subview(Float32Array.from({ length: vertexCount }, (_, i) => i / 97)),
    v: subview(
      Float32Array.from({ length: vertexCount }, (_, i) => 1 - i / 97)
    ),
    heightMeters: subview(
      Float32Array.from(
        { length: vertexCount },
        (_, i) => ((i % 3) - 1) * 12345.625
      )
    ),
    minimumHeightMeters: -12345.625,
    maximumHeightMeters: 12345.625,
    indices: subview(new Uint32Array([2, 0, 1, 3, 2, 1, 1, 0, 3])),
    westIndices: subview(new Uint32Array([3, 1, 0, 2])),
    southIndices: subview(new Uint32Array([1, 3, 0])),
    eastIndices: subview(new Uint32Array([2, 0, 3, 1])),
    northIndices: subview(new Uint32Array()),
    geometricErrorMeters: 0.125,
    byteLength: 987654,
    childTileMask: 15,
    noDataHeightMeters: -99999,
  };
  return {
    tile,
    geometry: {
      positions: subview(
        Float32Array.from({ length: vertexCount * 3 }, (_, i) => (i - 127) / 3)
      ),
      normals: subview(
        Float32Array.from({ length: vertexCount * 3 }, (_, i) =>
          i % 3 === 0 ? -0 : (i % 3) / 7
        )
      ),
      indices: subview(new Uint32Array([2, 0, 1, 3, 1, 2])),
      bounds: [-200.5, -12345.625, -40, 81.25, 12345.625, 120],
      sphere: [0.25, -0, 80.125, 18000.25],
    },
    reliefVertexMask: subview(
      Uint8Array.from(
        { length: vertexCount },
        (_, i) => [0, 1, 128, 255][i % 4]
      )
    ),
  };
};

const arraysOf = ({
  tile,
  geometry,
  reliefVertexMask,
}: CachedProjectedTerrainTile) => [
  tile.u,
  tile.v,
  tile.heightMeters,
  tile.indices,
  tile.westIndices,
  tile.southIndices,
  tile.eastIndices,
  tile.northIndices,
  ...(geometry ? [geometry.positions, geometry.normals, geometry.indices] : []),
  reliefVertexMask,
];

const streamsOf = (record: EncodedProjectedTerrainTile) => [
  record.tile.u,
  record.tile.v,
  record.tile.heightMeters,
  record.tile.indices,
  record.tile.westIndices,
  record.tile.southIndices,
  record.tile.eastIndices,
  record.tile.northIndices,
  ...(record.geometry
    ? [
        record.geometry.positions,
        record.geometry.normals,
        record.geometry.indices,
      ]
    : []),
  record.reliefVertexMask,
];

describe("lossless projected terrain Meshopt codec", () => {
  it("round-trips subviews, exact index order and metadata into owned arrays", async () => {
    expect(moduleLoads).toEqual({ encoder: 0, decoder: 0 });
    const input = fixture();
    const arrays = arraysOf(input);
    const backingSnapshots = arrays.map((array) =>
      new Uint8Array(array.buffer).slice()
    );
    const encoded = await encodeProjectedTerrainMeshoptRecord(input);
    expect(moduleLoads).toEqual({ encoder: 1, decoder: 0 });
    expect(encoded.version).toBe(PROJECTED_TERRAIN_MESHOPT_CODEC_VERSION);
    expect(encoded.decodedByteLength).toBe(
      arrays.reduce((sum, array) => sum + array.byteLength, 0)
    );
    expect(encoded.encodedByteLength).toBe(
      streamsOf(encoded).reduce(
        (sum, stream) => sum + stream.data.byteLength,
        0
      )
    );
    const payload = structuredClone(encoded);
    for (const stream of streamsOf(payload))
      Object.assign(stream, { data: subview(stream.data) });
    const restored = await decodeProjectedTerrainMeshoptRecord(payload);
    expect(moduleLoads).toEqual({ encoder: 1, decoder: 1 });
    expect(restored).toEqual(input);
    const restoredArrays = arraysOf(restored);
    expect(new Set(restoredArrays.map((array) => array.buffer)).size).toBe(
      arrays.length
    );
    restoredArrays.forEach((array, index) => {
      expect(bytesOf(array)).toEqual(bytesOf(arrays[index]));
      expect(array.constructor).toBe(arrays[index].constructor);
      expect(array.byteOffset).toBe(0);
      expect(array.buffer.byteLength).toBe(array.byteLength);
      expect(array.buffer).not.toBe(arrays[index].buffer);
      for (const stream of streamsOf(encoded))
        expect(array.buffer).not.toBe(stream.data.buffer);
      expect(new Uint8Array(arrays[index].buffer)).toEqual(
        backingSnapshots[index]
      );
    });
    expect(restored.tile.id).not.toBe(input.tile.id);
    expect(restored.tile.bounds).not.toBe(input.tile.bounds);
    expect(restored.geometry!.bounds).not.toBe(input.geometry!.bounds);
    expect(restored.geometry!.sphere).not.toBe(input.geometry!.sphere);
    restored.tile.u[0] = 9;
    expect(bytesOf(input.tile.u)).toEqual(backingSnapshots[0].subarray(8, -8));
  });

  it("uses only v1 level-0 raw attributes and exact index sequences", async () => {
    const { MeshoptEncoder } = await import(
      "meshoptimizer/meshopt_encoder.module.js"
    );
    const attributes = vi.spyOn(MeshoptEncoder, "encodeVertexBufferLevel");
    const sequences = vi.spyOn(MeshoptEncoder, "encodeIndexSequence");
    const triangles = vi.spyOn(MeshoptEncoder, "encodeIndexBuffer");
    const reorder = vi.spyOn(MeshoptEncoder, "reorderMesh");
    const filters = [
      "encodeFilterExp",
      "encodeFilterOct",
      "encodeFilterQuat",
      "encodeFilterColor",
    ] as const;
    const filterSpies = filters.map((name) => vi.spyOn(MeshoptEncoder, name));
    const input = fixture();
    const encoded = await encodeProjectedTerrainMeshoptRecord(input);
    expect(attributes).toHaveBeenCalledTimes(6);
    expect(attributes.mock.calls.map((call) => call.slice(2))).toEqual([
      [4, 0, 1],
      [4, 0, 1],
      [4, 0, 1],
      [12, 0, 1],
      [12, 0, 1],
      [4, 0, 1],
    ]);
    expect(sequences).toHaveBeenCalledTimes(5);
    for (const call of sequences.mock.calls) expect(call[2]).toBe(4);
    expect(triangles).not.toHaveBeenCalled();
    expect(reorder).not.toHaveBeenCalled();
    for (const filter of filterSpies) expect(filter).not.toHaveBeenCalled();
    expect(encoded.reliefVertexMask).toMatchObject({
      mode: "attributes",
      stride: 4,
    });
    expect(encoded.geometry!.indices.mode).toBe("sequence");
    expect(encoded.tile.northIndices).toMatchObject({ mode: "raw", count: 0 });
  });

  it("retains all Float32 bits including signed zeros and NaN payloads", async () => {
    const input = fixture();
    const patterns = new Uint32Array([
      0, 0x80000000, 1, 0x80000001, 0x7f7fffff, 0xff7fffff, 0x7fc12345,
      0xffc54321,
    ]);
    for (const array of arraysOf(input)) {
      if (array instanceof Float32Array) {
        new Uint32Array(array.buffer, array.byteOffset, patterns.length).set(
          patterns
        );
      }
    }
    const restored = await decodeProjectedTerrainMeshoptRecord(
      await encodeProjectedTerrainMeshoptRecord(input)
    );
    arraysOf(restored).forEach((array, index) => {
      expect(bytesOf(array)).toEqual(bytesOf(arraysOf(input)[index]));
    });
  });

  it("preserves no-data geometry and small masks without padding allocations", async () => {
    const input = { ...fixture(4), geometry: null };
    const encoded = await encodeProjectedTerrainMeshoptRecord(input);
    expect(encoded.geometry).toBeNull();
    expect(encoded.reliefVertexMask.mode).toBe("raw");
    expect(encoded.reliefVertexMask.data).toEqual(input.reliefVertexMask);
    expect(encoded.reliefVertexMask.data.buffer).not.toBe(
      input.reliefVertexMask.buffer
    );
    expect(await decodeProjectedTerrainMeshoptRecord(encoded)).toEqual(input);
  });

  it("supports an empty cached tile without sending empty streams to WASM", async () => {
    const input = fixture(4);
    const empty: CachedProjectedTerrainTile = {
      ...input,
      geometry: null,
      tile: {
        ...input.tile,
        u: new Float32Array(),
        v: new Float32Array(),
        heightMeters: new Float32Array(),
        indices: new Uint32Array(),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      },
      reliefVertexMask: new Uint8Array(),
    };
    const encoded = await encodeProjectedTerrainMeshoptRecord(empty);
    expect(encoded.decodedByteLength).toBe(0);
    expect(encoded.encodedByteLength).toBe(0);
    expect(streamsOf(encoded).every((stream) => stream.mode === "raw")).toBe(
      true
    );
    expect(await decodeProjectedTerrainMeshoptRecord(encoded)).toEqual(empty);
  });

  const malformed: Array<
    [string, (record: EncodedProjectedTerrainTile) => unknown]
  > = [
    ["version", (record) => ({ ...record, version: "unknown" })],
    [
      "negative count",
      (record) => ({
        ...record,
        tile: { ...record.tile, u: { ...record.tile.u, count: -1 } },
      }),
    ],
    [
      "fractional count",
      (record) => ({
        ...record,
        tile: { ...record.tile, u: { ...record.tile.u, count: 0.5 } },
      }),
    ],
    [
      "unbounded count",
      (record) => ({
        ...record,
        tile: {
          ...record.tile,
          u: { ...record.tile.u, count: Number.MAX_SAFE_INTEGER },
        },
      }),
    ],
    [
      "aggregate decoded budget",
      (record) => ({
        ...record,
        tile: {
          ...record.tile,
          u: { ...record.tile.u, count: 3 * 1024 ** 2 },
          v: { ...record.tile.v, count: 3 * 1024 ** 2 },
          heightMeters: { ...record.tile.heightMeters, count: 3 * 1024 ** 2 },
        },
      }),
    ],
    [
      "oversized compressed stream",
      (record) => ({
        ...record,
        tile: {
          ...record.tile,
          u: { ...record.tile.u, data: new Uint8Array(4096) },
        },
      }),
    ],
    [
      "wrong scalar type",
      (record) => ({
        ...record,
        tile: { ...record.tile, u: { ...record.tile.u, type: "uint32" } },
      }),
    ],
    [
      "wrong stride",
      (record) => ({
        ...record,
        tile: { ...record.tile, u: { ...record.tile.u, stride: 12 } },
      }),
    ],
    [
      "wrong mode",
      (record) => ({
        ...record,
        tile: {
          ...record.tile,
          indices: { ...record.tile.indices, mode: "attributes" },
        },
      }),
    ],
    [
      "untyped bytes",
      (record) => ({
        ...record,
        tile: { ...record.tile, u: { ...record.tile.u, data: [0xa1] } },
      }),
    ],
    [
      "inconsistent vertex counts",
      (record) => ({
        ...record,
        tile: { ...record.tile, v: { ...record.tile.v, count: 95 } },
      }),
    ],
    [
      "declared decoded bytes",
      (record) => ({ ...record, decodedByteLength: 0 }),
    ],
    [
      "declared encoded bytes",
      (record) => ({ ...record, encodedByteLength: 0 }),
    ],
    [
      "geometry bounds",
      (record) => ({
        ...record,
        geometry: { ...record.geometry, bounds: [1, 2] },
      }),
    ],
    [
      "negative sphere radius",
      (record) => ({
        ...record,
        geometry: { ...record.geometry, sphere: [0, 0, 0, -1] },
      }),
    ],
    [
      "non-finite metadata",
      (record) => ({
        ...record,
        tile: { ...record.tile, geometricErrorMeters: Infinity },
      }),
    ],
  ];
  it.each(malformed)(
    "rejects malformed %s before invoking the decoder",
    async (_, mutate) => {
      const encoded = await encodeProjectedTerrainMeshoptRecord(fixture());
      const { MeshoptDecoder } = await import(
        "meshoptimizer/meshopt_decoder.module.js"
      );
      const attributes = vi.spyOn(MeshoptDecoder, "decodeVertexBuffer");
      const indices = vi.spyOn(MeshoptDecoder, "decodeIndexSequence");
      await expect(
        decodeProjectedTerrainMeshoptRecord(mutate(encoded))
      ).rejects.toThrow();
      expect(attributes).not.toHaveBeenCalled();
      expect(indices).not.toHaveBeenCalled();
    }
  );

  it("rejects a bounded stream with corrupt compressed content", async () => {
    const encoded = await encodeProjectedTerrainMeshoptRecord(fixture());
    const damaged = {
      ...encoded,
      encodedByteLength:
        encoded.encodedByteLength - encoded.tile.u.data.length + 1,
      tile: {
        ...encoded.tile,
        u: { ...encoded.tile.u, data: new Uint8Array([0xa1]) },
      },
    };
    await expect(
      decodeProjectedTerrainMeshoptRecord(damaged)
    ).rejects.toThrow();
  });

  it("rejects invalid decoded indices even in an otherwise valid stream", async () => {
    const encoded = await encodeProjectedTerrainMeshoptRecord(fixture());
    const { MeshoptEncoder } = await import(
      "meshoptimizer/meshopt_encoder.module.js"
    );
    const invalid = MeshoptEncoder.encodeIndexSequence(
      bytesOf(new Uint32Array([0, 1, 1000])),
      3,
      4
    );
    const changed = {
      ...encoded,
      decodedByteLength:
        encoded.decodedByteLength - encoded.tile.indices.count * 4 + 12,
      encodedByteLength:
        encoded.encodedByteLength -
        encoded.tile.indices.data.length +
        invalid.length,
      tile: {
        ...encoded.tile,
        indices: { ...encoded.tile.indices, count: 3, data: invalid },
      },
    };
    await expect(
      decodeProjectedTerrainMeshoptRecord(changed)
    ).rejects.toThrow();
  });

  it("rejects invalid source array layouts without mutating them", async () => {
    const input = fixture();
    const malformed = {
      ...input,
      tile: { ...input.tile, heightMeters: new Float32Array(2) },
    };
    await expect(
      encodeProjectedTerrainMeshoptRecord(malformed)
    ).rejects.toThrow();
    input.tile.westIndices[0] = input.tile.u.length;
    await expect(encodeProjectedTerrainMeshoptRecord(input)).rejects.toThrow();
    expect(input.tile.westIndices[0]).toBe(input.tile.u.length);
  });
});
