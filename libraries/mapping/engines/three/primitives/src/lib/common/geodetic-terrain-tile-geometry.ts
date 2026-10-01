import { Box3, Vector3 } from "three";
import {
  createLocalEcefFrame,
  createRasterEcefProjector,
} from "@carma-geo/proj";
import {
  createProjectedTerrainTileGeometry,
  type ProjectedTerrainTileSource,
} from "./terrain-tile-geometry";

/** A terrain tile in ECEF, represented by a small RTC mesh and its transform.
 * Float32 holds tile-local metres rather than million-metre Earth coordinates.
 * Supply ellipsoidal heights, or a prepared source-datum offset sampler.
 */
export const createGeodeticTerrainTileGeometry = (
  tile: ProjectedTerrainTileSource,
  heightOffsetMeters?: (longitude: number, latitude: number) => number
) => {
  const longitude = (tile.bounds.west + tile.bounds.east) / 2;
  const latitude = (tile.bounds.south + tile.bounds.north) / 2;
  const frame = createLocalEcefFrame(longitude, latitude);
  const project = createRasterEcefProjector();
  const geometry = createProjectedTerrainTileGeometry({
    tile,
    triangleOrientation: "geographic",
    projectToWorld: (lng, lat, height, target) =>
      project(
        lng,
        lat,
        height + (heightOffsetMeters?.(lng, lat) ?? 0),
        target
      ).applyMatrix4(frame.localFromEcef),
  });
  const ecefBounds = new Box3();
  const position = geometry.getAttribute("position");
  const point = new Vector3();
  for (let index = 0; index < position.count; index++)
    ecefBounds.expandByPoint(
      point
        .fromBufferAttribute(position, index)
        .applyMatrix4(frame.ecefFromLocal)
    );
  return {
    geometry,
    ecefFromLocal: frame.ecefFromLocal,
    ecefBounds,
    localBounds: geometry.boundingBox!.clone() as Box3,
  };
};
