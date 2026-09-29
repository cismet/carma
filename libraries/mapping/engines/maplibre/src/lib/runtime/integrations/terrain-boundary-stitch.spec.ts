import { describe, expect, it } from "vitest";
import { createProjectedTerrainTileGeometry } from "@carma-mapping/engines/three/primitives/core";
import {
  buildGridTile,
  latitudeToTileY,
  longitudeToTileX,
} from "../../core/raster-dem-tile";
import {
  stitchTerrainBoundaries,
  type TerrainStitchInput,
} from "./terrain-boundary-stitch";
import { square } from "./terrain-boundary-stitch-fixtures";

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
