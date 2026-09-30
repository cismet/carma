import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareEqualLevelTerrainShell } from "./terrain-equal-level-boundaries";
import type { TerrainStitchInput } from "./terrain-boundary-stitch";

const mock = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  return {
    values,
    get: vi.fn(async (key: string) =>
      values.has(key) ? { value: structuredClone(values.get(key)) } : null
    ),
    put: vi.fn(async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
      return true;
    }),
  };
});
vi.mock("@carma-commons/utils", () => ({
  createDerivedBufferCache: () => ({
    register: () => ({ get: mock.get, put: mock.put }),
  }),
}));
const input = (): TerrainStitchInput => ({
  key: "a",
  id: { x: 0, y: 0, level: 1 },
  positions: new Float32Array([0, 0, 0, 1, 1, 0, 0, 2, 1, 1, 3, 1]),
  normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 2, 1, 1, 2, 3]),
  boundaryEdges: {
    west: new Uint32Array([0, 2]),
    east: new Uint32Array([1, 3]),
    north: new Uint32Array([0, 1]),
    south: new Uint32Array([2, 3]),
  },
  boundaryBaseHeights: {
    west: new Float32Array([0, 2]),
    east: new Float32Array([1, 3]),
    north: new Float32Array([0, 1]),
    south: new Float32Array([2, 3]),
  },
});
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mock.values.clear();
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

describe("persistent terrain edge atlas", () => {
  it("stores only topology and restores with fresh positions/normals after module reload", async () => {
    const first = await import("./terrain-edge-topology-cache");
    await first.prepareCachedEqualLevelTerrainShell(input());
    await vi.waitFor(() => expect(mock.put).toHaveBeenCalledOnce());
    const payload = mock.put.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "boundaryEdges",
      "indices",
      "normalTargets",
      "sourceIndices",
    ]);
    vi.resetModules();
    const next = await import("./terrain-edge-topology-cache"),
      moved = input();
    moved.key = "another-tile";
    moved.id = { x: 2, y: 1, level: 4 };
    for (let i = 0; i < moved.positions.length; i++) moved.positions[i] += 20;
    moved.normals.fill(0.25);
    expect(await next.prepareCachedEqualLevelTerrainShell(moved)).toEqual(
      prepareEqualLevelTerrainShell(moved)
    );
    expect(mock.put).toHaveBeenCalledOnce();
    expect(mock.get).toHaveBeenCalledTimes(2);
  });
  it("does not detach the resident atlas when the result transfers", async () => {
    const { prepareCachedEqualLevelTerrainShell: prepare } = await import(
      "./terrain-edge-topology-cache"
    );
    const shell = await prepare(input());
    const buffers = [
      shell.indices.buffer,
      shell.positions.buffer,
      shell.normals.buffer,
      shell.sourceIndices!.buffer,
      shell.normalTargets!.buffer,
      ...Object.values(shell.boundaryEdges).map((a) => a.buffer),
    ];
    structuredClone(shell, { transfer: buffers });
    expect(await prepare(input())).toEqual(
      prepareEqualLevelTerrainShell(input())
    );
  });
  it("invalidates changed topology, edge membership and vertex count", async () => {
    const { terrainEdgeTopologyKey: key } = await import(
      "./terrain-edge-topology-cache"
    );
    const a = input(),
      baseline = await key(a);
    a.indices = new Uint32Array([0, 2, 3]);
    expect(await key(a)).not.toBe(baseline);
    const b = input();
    b.boundaryEdges.west = new Uint32Array([0]);
    expect(await key(b)).not.toBe(baseline);
    const c = input();
    c.positions = new Float32Array(15);
    expect(await key(c)).not.toBe(baseline);
  });
  it("falls back on corrupt cache payloads and quota errors", async () => {
    mock.get.mockResolvedValueOnce({
      value: { sourceIndices: new Uint32Array([999]) },
    });
    mock.put.mockRejectedValueOnce(new Error("QuotaExceededError"));
    const { prepareCachedEqualLevelTerrainShell: prepare } = await import(
      "./terrain-edge-topology-cache"
    );
    expect(await prepare(input())).toEqual(
      prepareEqualLevelTerrainShell(input())
    );
  });
  it("does not wait indefinitely for storage", async () => {
    mock.get.mockImplementationOnce(() => new Promise(() => {}));
    const { prepareCachedEqualLevelTerrainShell: prepare } = await import(
      "./terrain-edge-topology-cache"
    );
    expect(await prepare(input())).toEqual(
      prepareEqualLevelTerrainShell(input())
    );
  });
  it("works without WebCrypto", async () => {
    vi.stubGlobal("crypto", undefined);
    const { prepareCachedEqualLevelTerrainShell: prepare } = await import(
      "./terrain-edge-topology-cache"
    );
    expect(await prepare(input())).toEqual(
      prepareEqualLevelTerrainShell(input())
    );
    expect(mock.get).not.toHaveBeenCalled();
  });
});
