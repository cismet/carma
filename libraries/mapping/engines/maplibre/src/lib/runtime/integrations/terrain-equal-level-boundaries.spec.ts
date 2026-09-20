import { BufferAttribute, BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import {
  prepareEqualLevelTerrainShell,
  stitchEqualLevelTerrainBoundaries,
} from "./terrain-equal-level-boundaries";
import {
  stitchTerrainBoundaries,
  runBatchedTerrainBoundaryStitch,
  executeTerrainBoundaryStitch,
  type TerrainStitchInput,
} from "./terrain-boundary-stitch";

const grid = (x: number, y: number, size = 9): TerrainStitchInput => {
  const positions = new Float32Array(size * size * 3);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const i = r * size + c,
        u = x + c / (size - 1),
        v = y + r / (size - 1);
      positions.set(
        [
          u,
          Math.sin(u * 3) * Math.cos(v * 4) + (c === 0 || r === 0 ? 0.02 : 0),
          v,
        ],
        i * 3
      );
      normals[i * 3 + 1] = 1;
      if (r < size - 1 && c < size - 1)
        indices.push(i, i + size, i + 1, i + 1, i + size, i + size + 1);
    }
  const boundaryEdges = {
    west: Uint32Array.from({ length: size }, (_, i) => i * size),
    east: Uint32Array.from({ length: size }, (_, i) => i * size + size - 1),
    north: Uint32Array.from({ length: size }, (_, i) => i),
    south: Uint32Array.from({ length: size }, (_, i) => (size - 1) * size + i),
  };
  return {
    key: `${x}/${y}`,
    id: { level: 4, x, y },
    positions,
    normals,
    indices: new Uint32Array(indices),
    boundaryEdges,
    boundaryBaseHeights: Object.fromEntries(
      Object.entries(boundaryEdges).map(([side, edge]) => [
        side,
        Float32Array.from(edge, (i) => positions[i * 3 + 1]),
      ])
    ) as TerrainStitchInput["boundaryBaseHeights"],
  };
};
const cut = (size = 9) => [
  grid(0, 0, size),
  grid(1, 0, size),
  grid(0, 1, size),
  grid(1, 1, size),
];

describe("equal-level border ownership", () => {
  it("has identical shared positions and area-weighted normals, including the four-way corner", () => {
    const result = stitchEqualLevelTerrainBoundaries(cut());
    const seen = new Map<string, number[]>();
    for (const tile of result)
      for (let i = 0; i < tile.positions.length; i += 3) {
        const p = Array.from(tile.positions.slice(i, i + 3)),
          n = Array.from(tile.normals.slice(i, i + 3));
        const key = `${p[0]}/${p[2]}`;
        if (seen.has(key)) expect([...p, ...n]).toEqual(seen.get(key));
        else seen.set(key, [...p, ...n]);
      }
  });
  it("matches Three normals on a single welded reference mesh", () => {
    const result = stitchEqualLevelTerrainBoundaries(cut());
    const positions: number[] = [],
      indices: number[] = [],
      lookup = new Map<string, number>();
    for (const tile of result) {
      const local: number[] = [];
      for (let i = 0; i < tile.positions.length; i += 3) {
        const point = Array.from(tile.positions.slice(i, i + 3)),
          key = point.join("/");
        if (!lookup.has(key)) {
          lookup.set(key, positions.length / 3);
          positions.push(...point);
        }
        local.push(lookup.get(key)!);
      }
      for (const i of tile.indices) indices.push(local[i]);
    }
    const reference = new BufferGeometry();
    reference.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(positions), 3)
    );
    reference.setIndex(indices);
    reference.computeVertexNormals();
    const normal = reference.getAttribute("normal");
    for (const tile of result)
      for (let i = 0; i < tile.positions.length; i += 3) {
        const index = lookup.get(
          Array.from(tile.positions.slice(i, i + 3)).join("/")
        )!;
        expect(tile.normals[i]).toBeCloseTo(normal.getX(index), 6);
        expect(tile.normals[i + 1]).toBeCloseTo(normal.getY(index), 6);
        expect(tile.normals[i + 2]).toBeCloseTo(normal.getZ(index), 6);
      }
    reference.dispose();
  });
  it("uses deterministic north-west ownership independent of arrival order and leaves sources unchanged", () => {
    const input = cut(),
      before = input.map((t) => t.positions.slice());
    const a = stitchEqualLevelTerrainBoundaries(input),
      b = stitchEqualLevelTerrainBoundaries([...input].reverse());
    expect(a).toEqual(b);
    input.forEach((t, i) => expect(t.positions).toEqual(before[i]));
  });
  it("compact two-ring outputs match full-face normals at every patched vertex", () => {
    const input = cut(17),
      full = stitchEqualLevelTerrainBoundaries(input);
    const shells = input.map(prepareEqualLevelTerrainShell),
      result = stitchEqualLevelTerrainBoundaries(shells);
    for (const output of result) {
      const shell = shells.find((s) => s.key === output.key)!,
        reference = full.find((t) => t.key === output.key)!;
      for (const i of shell.normalTargets!) {
        const source = shell.sourceIndices![i];
        expect(Array.from(output.normals.slice(i * 3, i * 3 + 3))).toEqual(
          Array.from(reference.normals.slice(source * 3, source * 3 + 3))
        );
      }
      expect(shell.positions.length).toBeLessThan(reference.positions.length);
    }
  });
  it("two-tile context rings match a larger cut for an incremental target", () => {
    const input = Array.from({ length: 64 }, (_, i) =>
      grid(i % 8, Math.floor(i / 8))
    );
    const shells = input.map(prepareEqualLevelTerrainShell);
    const target = new Set(["3/3"]);
    const all = stitchEqualLevelTerrainBoundaries(shells, target);
    const local = stitchEqualLevelTerrainBoundaries(
      shells.filter(
        (t) => Math.abs(t.id.x - 3) <= 2 && Math.abs(t.id.y - 3) <= 2
      ),
      target
    );
    expect(local).toEqual(all);
    expect(local.map((t) => t.key)).toEqual(["3/3"]);
  });
  it("can republish a cached general seam cut after an equal-level update", async () => {
    const inputs = cut();
    const execute = async (
      batch: TerrainStitchInput[],
      options: Parameters<typeof executeTerrainBoundaryStitch>[1]
    ) => executeTerrainBoundaryStitch(structuredClone(batch), options);
    const first = await runBatchedTerrainBoundaryStitch(
      inputs,
      new Map(),
      execute,
      { forceOutput: true }
    );
    const second = await runBatchedTerrainBoundaryStitch(
      inputs,
      first.state,
      execute,
      { forceOutput: true }
    );
    expect(second.updates).toHaveLength(4);
    expect(second.updates).toEqual(first.updates);
  });
  it("does not connect different LODs or isolated tiles", () => {
    const a = grid(0, 0),
      b = grid(1, 0);
    b.id.level++;
    expect(stitchEqualLevelTerrainBoundaries([a, b])).toEqual([]);
  });
  it("does not create triangles or fill missing-data faces", () => {
    const input = cut();
    input[0].indices = input[0].indices.slice(6);
    const result = stitchEqualLevelTerrainBoundaries(input);
    expect(result.find((t) => t.key === input[0].key)!.indices).toEqual(
      input[0].indices
    );
  });
});

if (process.env.TERRAIN_EDGE_BENCHMARK === "1")
  it("reports cold preparation and warm seam costs", () => {
    const median = (a: number[]) =>
      [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
    for (const size of [129, 514]) {
      const input = cut(size),
        t = performance.now(),
        shells = input.map(prepareEqualLevelTerrainShell),
        prepareMs = performance.now() - t;
      const times = { old: [] as number[], owned: [] as number[] };
      for (let r = 0; r < 6; r++)
        for (const name of r % 2
          ? (["owned", "old"] as const)
          : (["old", "owned"] as const)) {
          const start = performance.now();
          const result =
            name === "old"
              ? stitchTerrainBoundaries(
                  input.map((t) => ({
                    ...t,
                    positions: t.positions.slice(),
                    normals: t.normals.slice(),
                    indices: t.indices.slice(),
                  }))
                )
              : stitchEqualLevelTerrainBoundaries(shells);
          const elapsed = performance.now() - start;
          expect(result.length).toBe(4);
          if (r) times[name].push(elapsed);
        }
      console.info(
        "EDGE_BENCHMARK " +
          JSON.stringify({
            size,
            tiles: 4,
            prepareMs,
            oldMedianMs: median(times.old),
            ownedMedianMs: median(times.owned),
            samples: times,
            shellBytes: shells.reduce(
              (s, t) =>
                s +
                t.positions.byteLength +
                t.normals.byteLength +
                t.indices.byteLength +
                t.sourceIndices!.byteLength +
                t.normalTargets!.byteLength,
              0
            ),
          })
      );
    }
  }, 60000);
