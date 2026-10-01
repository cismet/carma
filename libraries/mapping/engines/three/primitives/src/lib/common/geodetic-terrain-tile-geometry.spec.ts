import { describe, expect, it } from "vitest";
import { Box3, Vector3 } from "three";
import {
  cartographicToEcef,
  EARTH_CIRCUMFERENCE,
  getWgs84DegFromWebMercator,
  WEB_MERCATOR_MAX_LATITUDE_DEG,
} from "@carma-geo/proj";
import { degToRadNumeric } from "@carma-units";
import type { Meters } from "@carma-units";
import { createGeodeticTerrainTileGeometry } from "./geodetic-terrain-tile-geometry";

describe("ECEF terrain geometry", () => {
  it.each([0.005, 1.40625])(
    "preserves source points within 1 cm over a %s degree tile",
    (width) => {
      const bounds = {
        west: 7.1,
        east: 7.1 + width,
        south: 51.2,
        north: 51.2 + width,
      };
      const tile = {
        bounds,
        u: [0, 1, 0, 1, 0.5],
        v: [0, 0, 1, 1, 0.5],
        heightMeters: [100, 200, 120, 180, 150],
        indices: [0, 1, 4, 1, 3, 4, 3, 2, 4, 2, 0, 4],
      };
      const projected = createGeodeticTerrainTileGeometry(tile);
      const positions = projected.geometry.getAttribute("position");
      const reconstructedBounds = new Box3();
      for (let i = 0; i < positions.count; i++) {
        const actual = new Vector3()
          .fromBufferAttribute(positions, i)
          .applyMatrix4(projected.ecefFromLocal);
        reconstructedBounds.expandByPoint(actual);
        const expected = cartographicToEcef(
          degToRadNumeric(bounds.west + tile.u[i] * width),
          degToRadNumeric(bounds.south + tile.v[i] * width),
          tile.heightMeters[i]
        );
        expect(actual.distanceTo(expected)).toBeLessThan(
          width < 0.01 ? 0.001 : 0.01
        );
        expect(
          projected.ecefBounds
            .clone()
            .expandByScalar(0.01)
            .containsPoint(expected)
        ).toBe(true);
      }
      expect(projected.ecefBounds.min.toArray()).toEqual(
        reconstructedBounds.min.toArray()
      );
      expect(projected.ecefBounds.max.toArray()).toEqual(
        reconstructedBounds.max.toArray()
      );
      projected.geometry.dispose();
    }
  );

  it("projects z0-z2 Mercator tiles globally with enclosed bounds and outward faces", () => {
    const segments = 8;
    const side = segments + 1;
    const maximumErrors = new Map<number, number>();
    const tileLatitude = (row: number, count: number) =>
      row === 0
        ? WEB_MERCATOR_MAX_LATITUDE_DEG
        : row === count
        ? -WEB_MERCATOR_MAX_LATITUDE_DEG
        : getWgs84DegFromWebMercator(
            0 as Meters,
            ((0.5 - row / count) * EARTH_CIRCUMFERENCE) as Meters
          )[1];

    for (const zoom of [0, 1, 2]) {
      const count = 2 ** zoom;
      let maximumReconstructionError = 0;
      for (let y = 0; y < count; y++)
        for (let x = 0; x < count; x++) {
          const bounds = {
            west: (x / count) * 360 - 180,
            east: ((x + 1) / count) * 360 - 180,
            south: tileLatitude(y + 1, count),
            north: tileLatitude(y, count),
          };
          if (x === 0) expect(bounds.west).toBe(-180);
          if (x === count - 1) expect(bounds.east).toBe(180);
          if (y === 0) expect(bounds.north).toBe(WEB_MERCATOR_MAX_LATITUDE_DEG);
          if (y === count - 1)
            expect(bounds.south).toBe(-WEB_MERCATOR_MAX_LATITUDE_DEG);
          expect(y < count / 2 ? bounds.north > 0 : bounds.south < 0).toBe(
            true
          );
          const u: number[] = [];
          const v: number[] = [];
          const heightMeters: number[] = [];
          const indices: number[] = [];
          for (let row = 0; row <= segments; row++)
            for (let column = 0; column <= segments; column++) {
              u.push(column / segments);
              v.push(row / segments);
              heightMeters.push(100 + 40 * Math.sin(column + row));
            }
          for (let row = 0; row < segments; row++)
            for (let column = 0; column < segments; column++) {
              const a = row * side + column;
              const b = a + 1;
              const c = a + side;
              const d = c + 1;
              indices.push(a, c, b, b, c, d);
            }

          const projected = createGeodeticTerrainTileGeometry({
            bounds,
            u,
            v,
            heightMeters,
            indices,
          });
          const positions = projected.geometry.getAttribute("position");
          const reconstructed: Vector3[] = [];
          for (let index = 0; index < positions.count; index++) {
            const actual = new Vector3()
              .fromBufferAttribute(positions, index)
              .applyMatrix4(projected.ecefFromLocal);
            reconstructed.push(actual);
            expect(projected.ecefBounds.containsPoint(actual)).toBe(true);
            const expected = cartographicToEcef(
              degToRadNumeric(
                bounds.west + u[index] * (bounds.east - bounds.west)
              ),
              degToRadNumeric(
                bounds.south + v[index] * (bounds.north - bounds.south)
              ),
              heightMeters[index]
            );
            maximumReconstructionError = Math.max(
              maximumReconstructionError,
              actual.distanceTo(expected)
            );
          }

          const geometryIndices = projected.geometry.getIndex()!;
          const edgeB = new Vector3();
          const normal = new Vector3();
          const center = new Vector3();
          for (let offset = 0; offset < geometryIndices.count; offset += 3) {
            const a = reconstructed[geometryIndices.getX(offset)];
            const b = reconstructed[geometryIndices.getX(offset + 1)];
            const c = reconstructed[geometryIndices.getX(offset + 2)];
            normal.subVectors(b, a).cross(edgeB.subVectors(c, a));
            center
              .copy(a)
              .add(b)
              .add(c)
              .multiplyScalar(1 / 3);
            expect(normal.dot(center)).toBeGreaterThan(0);
          }
          projected.geometry.dispose();
        }
      maximumErrors.set(zoom, maximumReconstructionError);
    }

    expect(maximumErrors.get(0)).toBeLessThan(0.75);
    expect(maximumErrors.get(1)).toBeLessThan(0.4);
    expect(maximumErrors.get(2)).toBeLessThan(0.25);
  });
});
