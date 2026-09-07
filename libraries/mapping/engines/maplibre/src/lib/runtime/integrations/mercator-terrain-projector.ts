import { MercatorCoordinate } from "maplibre-gl";
import type { Vector3 } from "three";

/** One projector per tile: Mercator x depends only on longitude, while y and
 * altitude scale depend only on latitude. A raster needs O(width + height)
 * vendor projections instead of one trigonometric projection per vertex.
 * Tile-local caches are released after geometry construction.
 */
export const createMercatorTerrainProjector = (origin: MercatorCoordinate) => {
  const meterScale = origin.meterInMercatorCoordinateUnits();
  const originHeight = origin.z / meterScale;
  const columns = new Map<number, number>();
  const rows = new Map<
    number,
    Readonly<{ northing: number; heightScale: number }>
  >();
  return (
    longitude: number,
    latitude: number,
    height: number,
    target: Vector3
  ): Vector3 => {
    let easting = columns.get(longitude);
    if (easting === undefined) {
      easting =
        (MercatorCoordinate.fromLngLat([longitude, 0], 0).x - origin.x) /
        meterScale;
      columns.set(longitude, easting);
    }
    let row = rows.get(latitude);
    if (!row) {
      const coordinate = MercatorCoordinate.fromLngLat([0, latitude], 1);
      row = {
        northing: (coordinate.y - origin.y) / meterScale,
        heightScale: coordinate.z / meterScale,
      };
      rows.set(latitude, row);
    }
    return target.set(
      easting,
      height * row.heightScale - originHeight,
      row.northing
    );
  };
};
