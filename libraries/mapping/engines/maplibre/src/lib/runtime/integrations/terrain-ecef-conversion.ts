import { MercatorCoordinate } from "maplibre-gl";
import { BufferAttribute, Vector3 } from "three";
import { createGeodeticTerrainTileGeometry } from "@carma-mapping/engines/three/primitives/core";
import type { TerrainTile } from "../../core/raster-dem-tile";
import { terrainIndexArraysEqual } from "../../core/terrain-index-equality";
import { getTerrainEcefConversionContext } from "./terrain-ecef-conversion-context";

/** Plain buffers keep the initial projection worker-safe without copying the
 * raster or boundary metadata. Inputs remain owned by the native surface. */
export type TerrainEcefConversionInput = Readonly<{
  origin: readonly [number, number];
  tile: Pick<TerrainTile, "bounds" | "u" | "v" | "heightMeters">;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array | Uint32Array;
  nativeBaseHeights?: Float32Array;
}>;

/** Shared by the worker and synchronous seam handover. Positions remain RTC
 * Float32 buffers; geographic intermediates retain Float64 precision. */
export const convertTerrainGeometryToEcef = (
  input: TerrainEcefConversionInput,
  heightOffsetMeters?: (longitude: number, latitude: number) => number
) => {
  const { tile, positions, normals, indices } = input;
  const context = getTerrainEcefConversionContext(input);
  const { mercator, scale } = context;
  const { bounds } = tile;
  const nativeBaseHeights =
    input.nativeBaseHeights ?? new Float32Array(tile.u.length);
  if (!input.nativeBaseHeights) {
    for (let i = 0; i < tile.u.length; i++) {
      nativeBaseHeights[i] =
        MercatorCoordinate.fromLngLat(
          [
            bounds.west + tile.u[i] * (bounds.east - bounds.west),
            bounds.south + tile.v[i] * (bounds.north - bounds.south),
          ],
          tile.heightMeters[i]
        ).z / scale;
    }
  }
  const count = positions.length / 3;
  const u = count === tile.u.length ? tile.u : new Float64Array(count);
  const v = count === tile.v.length ? tile.v : new Float64Array(count);
  const heights = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    if (i < tile.u.length) {
      if (u !== tile.u) u[i] = tile.u[i];
      if (v !== tile.v) v[i] = tile.v[i];
      // Source-grid coordinates are exact and immutable. Only appended seam
      // vertices need inverse Mercator; Float32 XY must not redefine the grid.
      const verticalScale = context.verticalScale(
        bounds.south + tile.v[i] * (bounds.north - bounds.south)
      );
      heights[i] =
        tile.heightMeters[i] +
        (positions[i * 3 + 1] - nativeBaseHeights[i]) / verticalScale;
    } else {
      // Mixed-level seams append vertices after the immutable source grid.
      const coordinate = new MercatorCoordinate(
        mercator.x + positions[i * 3] * scale,
        mercator.y + positions[i * 3 + 2] * scale,
        positions[i * 3 + 1] * scale
      );
      const lngLat = coordinate.toLngLat();
      u[i] = (lngLat.lng - bounds.west) / (bounds.east - bounds.west);
      v[i] = (lngLat.lat - bounds.south) / (bounds.north - bounds.south);
      heights[i] = coordinate.toAltitude();
    }
  }
  const projected = createGeodeticTerrainTileGeometry(
    { bounds, u, v, heightMeters: heights, indices },
    heightOffsetMeters,
    { ...context, normalBuffer: new Float32Array(count * 3) }
  );
  const indicesUnchanged = terrainIndexArraysEqual(
    projected.geometry.index!.array as Uint16Array | Uint32Array,
    indices
  );
  if (indicesUnchanged)
    // A fresh attribute keeps GPU ownership independent from native geometry.
    projected.geometry.setIndex(new BufferAttribute(indices, 1));
  // Carry the agreed native seam normals through the same tangent transform.
  const target = projected.geometry.getAttribute("normal");
  const { tileFromEcef, project } = context;
  const direction = new Vector3();
  for (let i = 0; i < count; i++) {
    direction.fromArray(normals, i * 3);
    project
      .direction(
        bounds.west + u[i] * (bounds.east - bounds.west),
        bounds.south + v[i] * (bounds.north - bounds.south),
        direction,
        direction
      )
      .transformDirection(tileFromEcef);
    target.setXYZ(i, direction.x, direction.y, direction.z);
  }
  return { ...projected, nativeBaseHeights, indicesUnchanged };
};
