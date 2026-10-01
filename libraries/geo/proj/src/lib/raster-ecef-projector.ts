import { Vector3 } from "three";
import { degToRadNumeric } from "@carma-units";
import { WGS84_A, WGS84_E2 } from "./geodetic";

/** Exact WGS84 projection with reusable raster rows/columns. Height is affine.
 * No LUT approximation or vertical datum conversion is introduced here.
 * One instance belongs to one tile, so the lookup tables remain bounded.
 */
export const createRasterEcefProjector = () => {
  const columns = new Map<number, readonly [number, number]>();
  const rows = new Map<number, readonly [number, number, number]>();
  let previousLatitude: number | undefined;
  let previousRow: readonly [number, number, number] | undefined;
  const project = (
    longitude: number,
    latitude: number,
    height: number,
    out: Vector3
  ) => {
    let column = columns.get(longitude);
    if (!column) {
      const radians = degToRadNumeric(longitude);
      column = [Math.cos(radians), Math.sin(radians)];
      columns.set(longitude, column);
    }
    let row = latitude === previousLatitude ? previousRow : rows.get(latitude);
    if (!row) {
      const radians = degToRadNumeric(latitude);
      const sin = Math.sin(radians);
      row = [
        Math.cos(radians),
        sin,
        WGS84_A / Math.sqrt(1 - WGS84_E2 * sin * sin),
      ];
      rows.set(latitude, row);
    }
    previousLatitude = latitude;
    previousRow = row;
    const radius = row[2] + height;
    return out.set(
      radius * row[0] * column[0],
      radius * row[0] * column[1],
      (row[2] * (1 - WGS84_E2) + height) * row[1]
    );
  };
  const basisPoint = new Vector3();
  // Rotate an east/up/south tangent direction into ECEF with the same cached
  // longitude columns and latitude rows as the position projection.
  return Object.assign(project, {
    direction: (
      longitude: number,
      latitude: number,
      direction: Vector3,
      out: Vector3
    ) => {
      project(longitude, latitude, 0, basisPoint);
      const [cosLon, sinLon] = columns.get(longitude)!;
      const [cosLat, sinLat] = rows.get(latitude)!;
      const { x, y, z } = direction;
      return out.set(
        -x * sinLon + y * cosLat * cosLon + z * sinLat * cosLon,
        x * cosLon + y * cosLat * sinLon + z * sinLat * sinLon,
        y * sinLat - z * cosLat
      );
    },
  });
};
