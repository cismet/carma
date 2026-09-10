import { describe, expect, it } from "vitest";
import { createProjectedTerrainTileGeometry } from "@carma-mapping/engines/three/primitives/core";
import {
  buildGridTile,
  latitudeToTileY,
  longitudeToTileX,
} from "../../core/raster-dem-tile";
import {
  prepareTerrainBoundaryStitch,
  executeTerrainBoundaryStitch,
  stitchTerrainBoundaries,
  type TerrainBoundaryStitchState,
  type TerrainStitchInput,
} from "./terrain-boundary-stitch";
import {
  executeTerrainWorkerTask,
  terrainResultTransfers,
} from "./terrain-worker-task";

const square = (x: number, z: number, height: number): TerrainStitchInput => ({
  key: `${x}/${z}`,
  id: { level: 2, x, y: z },
  positions: new Float32Array([
    x,
    height,
    z,
    x + 1,
    height,
    z,
    x,
    height,
    z + 1,
    x + 1,
    height,
    z + 1,
  ]),
  normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
  indices: new Uint16Array([0, 2, 1, 1, 2, 3]),
  boundaryEdges: {
    west: new Uint32Array([0, 2]),
    east: new Uint32Array([1, 3]),
    north: new Uint32Array([0, 1]),
    south: new Uint32Array([2, 3]),
  },
  boundaryBaseHeights: {
    west: new Float32Array([height, height]),
    east: new Float32Array([height, height]),
    north: new Float32Array([height, height]),
    south: new Float32Array([height, height]),
  },
});

// Includes interior faces omitted by the compact probe. Vary both slopes and
// source offsets so missing normal contributors cannot pass as flat terrain.
const grid = (
  x: number,
  z: number,
  level = 2,
  size = 1
): TerrainStitchInput => {
  const segments = 8;
  const width = segments + 1;
  const positions = new Float32Array(width * width * 3);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  for (let row = 0; row < width; row++) {
    for (let col = 0; col < width; col++) {
      const i = row * width + col;
      const px = x + (col * size) / segments;
      const pz = z + (row * size) / segments;
      positions.set([px, 7 * Math.sin(px * 2.7 + pz) + x + z, pz], i * 3);
      normals.set([0, 1, 0], i * 3);
      if (row < segments && col < segments)
        indices.push(i, i + width, i + 1, i + 1, i + width, i + width + 1);
    }
  }
  const edge = (start: number, step: number) =>
    Uint32Array.from({ length: width }, (_, i) => start + i * step);
  const boundaryEdges = {
    west: edge(0, width),
    east: edge(segments, width),
    north: edge(0, 1),
    south: edge(segments * width, 1),
  };
  const boundaryBaseHeights = Object.fromEntries(
    Object.entries(boundaryEdges).map(([side, vertices]) => [
      side,
      Float32Array.from(vertices, (i) => positions[i * 3 + 1]),
    ])
  ) as TerrainStitchInput["boundaryBaseHeights"];
  return {
    key: `${level}/${x}/${z}`,
    id: { level, x: x / size, y: z / size },
    positions,
    normals,
    indices: new Uint16Array(indices),
    boundaryEdges,
    boundaryBaseHeights,
  };
};

describe("incremental terrain boundary stitching", () => {
  const checkTransition = (
    inputs: TerrainStitchInput[],
    previous: TerrainBoundaryStitchState = new Map(),
    published = new Map<
      string,
      ReturnType<typeof stitchTerrainBoundaries>[number]
    >()
  ) => {
    const original = structuredClone(inputs);
    const plan = prepareTerrainBoundaryStitch(inputs, previous);
    const probe = executeTerrainBoundaryStitch(
      structuredClone(plan.probeInputs),
      {
        captureBoundaryState: true,
        prepareShellKeys: plan.prepareShellKeys,
        probeOnly: !plan.allNew,
      }
    );
    const work = plan.resolve(probe.updates, probe.shells);
    const rawUpdates = plan.allNew
      ? probe.updates
      : work.outputKeys.length
      ? stitchTerrainBoundaries(structuredClone(work.inputs), {
          outputKeys: work.outputKeys,
        })
      : [];
    const updates = rawUpdates.map(
      ({ key, positions, normals, indices, box, sphere }) => ({
        key,
        positions,
        normals,
        indices,
        box,
        sphere,
      })
    );
    const compact = stitchTerrainBoundaries(
      structuredClone([...work.state.values()].map(({ shell }) => shell)),
      { captureBoundaryState: true }
    );
    for (const result of compact)
      expect(result.boundaryState).toEqual(
        work.state.get(result.key)!.boundaryState
      );
    const next = new Map(
      [...published].filter(([key]) =>
        inputs.some((input) => input.key === key)
      )
    );
    updates.forEach((update) => next.set(update.key, update));
    for (const expected of stitchTerrainBoundaries(structuredClone(inputs))) {
      // Byte-identical typed arrays, topology, bounds and sphere, not tolerance.
      expect(next.get(expected.key)).toEqual(expected);
    }
    expect(inputs).toEqual(original);
    return { state: work.state, published: next, updates, work };
  };

  it("limits updates across additions/removals and restores immutable edge bases", () => {
    const tiles = Array.from({ length: 16 }, (_, i) =>
      grid(i % 4, Math.floor(i / 4))
    );
    let current = checkTransition(tiles);
    expect(current.updates).toHaveLength(16);
    current = checkTransition(tiles.slice(1), current.state, current.published);
    expect(current.updates.length).toBeLessThan(15);
    expect(current.updates.map((update) => update.key)).not.toContain(
      tiles[15].key
    );
    current = checkTransition(tiles, current.state, current.published);
    expect(current.updates.length).toBeLessThan(16);
    current = checkTransition(tiles, current.state, current.published);
    expect(current.updates).toEqual([]);
    // A changed iteration order can change Float32 sums at junctions.
    checkTransition([...tiles].reverse(), current.state, current.published);
  });

  it.each([2, 4])(
    "preserves exact 1:%i mixed-LOD refinements and four-way corners",
    (ratio) => {
      const coarse = [grid(0, 0), grid(0, 1)];
      const fine = Array.from({ length: ratio * 2 }, (_, i) =>
        grid(1, i / ratio, 2 + Math.log2(ratio), 1 / ratio)
      );
      let current = checkTransition([...coarse, ...fine]);
      current = checkTransition(
        [...coarse, ...fine.slice(1)],
        current.state,
        current.published
      );
      current = checkTransition(
        [...coarse, ...fine],
        current.state,
        current.published
      );
      checkTransition([coarse[0], ...fine], current.state, current.published);
    }
  );

  it("invalidates same-key replacement even when only the interior changes", () => {
    const tiles = [grid(0, 0), grid(1, 0), grid(8, 8)];
    const current = checkTransition(tiles);
    const replacement = structuredClone(tiles[0]);
    replacement.positions[(4 * 9 + 4) * 3 + 1] += 42;
    const next = checkTransition(
      [replacement, ...tiles.slice(1)],
      current.state,
      current.published
    );
    expect(next.updates.map((update) => update.key)).toEqual([replacement.key]);
    expect(next.work.inputs[2].positions.length).toBeLessThan(
      tiles[2].positions.length
    );
  });

  it("does not publish a discarded plan or retain removed tiles in the next state", () => {
    const a = grid(0, 0),
      b = grid(1, 0),
      c = grid(0, 1);
    const initial = checkTransition([a, b]);
    checkTransition([a, b, c], initial.state, initial.published); // stale result, not accepted
    const accepted = checkTransition([a, c], initial.state, initial.published);
    expect([...accepted.state.keys()]).toEqual([a.key, c.key]);
    expect(accepted.updates.map((update) => update.key)).toContain(c.key);
  });

  it("matches changing multi-level frontiers, holes and source replacement", () => {
    const roots = [grid(0, 0), grid(1, 0), grid(0, 1), grid(1, 1)];
    roots[0].indices = roots[0].indices.filter(
      (_, offset) =>
        !roots[0].indices
          .subarray(Math.floor(offset / 3) * 3, Math.floor(offset / 3) * 3 + 3)
          .includes(0)
    );
    roots[0].normals.fill(0, 0, 3);
    let frontier = roots;
    let current = checkTransition(frontier);
    for (let step = 0; step < 8; step++) {
      const candidates = frontier.filter((tile) => tile.id.level < 4);
      const tile = candidates[step % candidates.length];
      const size = 2 ** (2 - tile.id.level) / 2;
      const children = Array.from({ length: 4 }, (_, i) =>
        grid(
          tile.positions[0] + (i % 2) * size,
          tile.positions[2] + Math.floor(i / 2) * size,
          tile.id.level + 1,
          size
        )
      );
      frontier = [...frontier.filter((entry) => entry !== tile), ...children];
      if (step % 2) frontier.reverse();
      current = checkTransition(frontier, current.state, current.published);
    }
    current = checkTransition(
      frontier.slice(2),
      current.state,
      current.published
    );
    checkTransition(roots, current.state, current.published);
  });

  it("transfers pristine generated shells and probe state without aliasing scratch geometry", async () => {
    const input = grid(0, 0);
    const plan = prepareTerrainBoundaryStitch([input]);
    const result = await executeTerrainWorkerTask(
      structuredClone({
        kind: "stitch",
        inputs: plan.probeInputs,
        prepareShellKeys: plan.prepareShellKeys,
        captureBoundaryState: true,
        probeOnly: true,
      })
    );
    expect(result.kind).toBe("stitch");
    if (result.kind !== "stitch") throw new Error("Expected stitch response");
    const received = structuredClone(result, {
      transfer: terrainResultTransfers(result),
    });
    expect(result.updates[0].positions.byteLength).toBe(0);
    expect(result.shells![0].positions.byteLength).toBe(0);
    const work = plan.resolve(received.updates, received.shells);
    const full = stitchTerrainBoundaries(structuredClone(work.inputs));
    expect(full).toEqual(stitchTerrainBoundaries(structuredClone([input])));
    expect(work.state.get(input.key)!.shell.normals[1]).toBe(1);
  });
});

describe("terrain boundary stitching", () => {
  it.each([2, 4])(
    "makes a 1:%i LOD boundary conforming, with the same normal field",
    (ratio) => {
      const coarse = square(0, 0, 100);
      const fineTiles = Array.from({ length: ratio }, (_, offset) => {
        const fine = square(1, 0, 110);
        fine.key = `fine-${offset}`;
        fine.id = { level: 2 + Math.log2(ratio), x: ratio, y: offset };
        for (let i = 0; i < 4; i++) {
          fine.positions[i * 3] = 1 + (fine.positions[i * 3] - 1) / ratio;
          fine.positions[i * 3 + 2] =
            (fine.positions[i * 3 + 2] + offset) / ratio;
        }
        return fine;
      });
      const [result, ...fineResults] = stitchTerrainBoundaries([
        coarse,
        ...fineTiles,
      ]);
      for (const fine of fineResults) {
        for (const index of [0, 2]) {
          const point = [...fine.positions.slice(index * 3, index * 3 + 3)];
          let match = -1;
          for (let i = 0; i < result.positions.length / 3; i++) {
            if (
              point.every(
                (value, axis) => value === result.positions[i * 3 + axis]
              )
            )
              match = i;
          }
          expect(
            match,
            `missing coarse breakpoint ${point}`
          ).toBeGreaterThanOrEqual(0);
          expect([...result.indices]).toContain(match);
          expect([...result.normals.slice(match * 3, match * 3 + 3)]).toEqual([
            ...fine.normals.slice(index * 3, index * 3 + 3),
          ]);
        }
      }
      // The former unsplit edge must not survive as one long triangle edge.
      for (let i = 0; i < result.indices.length; i += 3) {
        const triangle = [...result.indices.slice(i, i + 3)];
        expect(triangle.includes(1) && triangle.includes(3)).toBe(false);
      }
    }
  );
  it.each(["south", "east"] as const)(
    "does not introduce a ridge or normal seam at the %s raster edge",
    (side) => {
      const size = 8;
      const origin = { x: 17023, y: 10926, level: 15 };
      const inputs = [0, 1].map((offset): TerrainStitchInput => {
        const offsetY = side === "south" ? offset : 0;
        const offsetX = side === "east" ? offset : 0;
        const pixels = new Uint8ClampedArray(size * size * 4);
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const height =
              100 +
              (offsetX * size + x + 0.5) / 4 +
              (offsetY * size + y + 0.5) / 2;
            const encoded = Math.round((height + 32768) * 256);
            pixels.set(
              [encoded >> 16, (encoded >> 8) & 255, encoded & 255, 255],
              (y * size + x) * 4
            );
          }
        }
        const tile = buildGridTile(
          { ...origin, x: origin.x + offsetX, y: origin.y + offsetY },
          { width: size, height: size, pixels },
          size,
          0.01
        );
        const geometry = createProjectedTerrainTileGeometry({
          tile,
          projectToWorld: (lng, lat, height, target) =>
            target.set(
              (longitudeToTileX(lng, origin.level) - origin.x) * size,
              height,
              (latitudeToTileY(lat, origin.level) - origin.y) * size
            ),
        });
        const positions = geometry.getAttribute("position")
          .array as Float32Array;
        const boundaryEdges = {
          west: tile.westIndices,
          east: tile.eastIndices,
          north: tile.northIndices,
          south: tile.southIndices,
        };
        return {
          key: String(offset),
          id: tile.id,
          positions,
          normals: geometry.getAttribute("normal").array as Float32Array,
          indices: geometry.index!.array as Uint32Array,
          boundaryEdges,
          boundaryBaseHeights: Object.fromEntries(
            Object.entries(boundaryEdges).map(([side, indices]) => [
              side,
              Float32Array.from(indices, (i) => positions[i * 3 + 1]),
            ])
          ) as TerrainStitchInput["boundaryBaseHeights"],
        };
      });
      const result = stitchTerrainBoundaries(inputs);
      // Exclude the two corners, whose west/east neighbors are deliberately absent.
      for (const index of inputs[0].boundaryEdges[side].slice(1, -1)) {
        const positions = result[0].positions;
        const expected =
          100 + positions[index * 3] / 4 + positions[index * 3 + 2] / 2;
        expect(Math.abs(positions[index * 3 + 1] - expected)).toBeLessThan(
          0.0001
        );
      }
      const neighborSide = side === "south" ? "north" : "west";
      const normalization = Math.hypot(0.25, 1, 0.5);
      for (let i = 2; i < size; i++) {
        const a = inputs[0].boundaryEdges[side][i];
        const b = inputs[1].boundaryEdges[neighborSide][i];
        for (let axis = 0; axis < 3; axis++) {
          expect(result[0].positions[a * 3 + axis]).toBeCloseTo(
            result[1].positions[b * 3 + axis],
            4
          );
          expect(result[0].normals[a * 3 + axis]).toBeCloseTo(
            [-0.25, 1, -0.5][axis] / normalization,
            4
          );
          expect(result[0].normals[a * 3 + axis]).toBeCloseTo(
            result[1].normals[b * 3 + axis],
            4
          );
        }
      }
    }
  );
  it("projects fine edges onto the final coarse edge, including changed coarse corners", () => {
    const coarse = square(0, 0, 100);
    const north = square(0, -1, 120);
    const fine = { ...square(1, 0, 130), id: { level: 3, x: 1, y: 0 } };
    for (let index = 0; index < 4; index++) {
      fine.positions[index * 3] = 1 + (fine.positions[index * 3] - 1) / 2;
      fine.positions[index * 3 + 2] /= 2;
    }
    const [a, , b] = stitchTerrainBoundaries([coarse, north, fine]);
    expect(b.positions[1]).toBeCloseTo(a.positions[4], 5);
    expect(b.positions[7]).toBeCloseTo(
      (a.positions[4] + a.positions[10]) / 2,
      5
    );
  });
  it("closes both north/south and east/west edges", () => {
    const tiles = stitchTerrainBoundaries([
      square(0, 0, 100),
      square(1, 0, 110),
      square(0, 1, 120),
    ]);
    expect(tiles[0].positions[4]).toBe(tiles[1].positions[1]);
    expect(tiles[0].positions[7]).toBe(tiles[2].positions[1]);
  });
  it("assigns one height to a four-tile junction", () => {
    const tiles = stitchTerrainBoundaries([
      square(0, 0, 100),
      square(1, 0, 110),
      square(0, 1, 120),
      square(1, 1, 140),
    ]);
    const junction = [
      tiles[0].positions[10],
      tiles[1].positions[7],
      tiles[2].positions[4],
      tiles[3].positions[1],
    ];
    expect(new Set(junction).size).toBe(1);
    const normals = [0, 1, 2, 3].map((tile) => {
      const index = [3, 2, 1, 0][tile];
      return [...tiles[tile].normals.slice(index * 3, index * 3 + 3)];
    });
    for (const normal of normals) expect(normal).toEqual(normals[0]);
  });
});
