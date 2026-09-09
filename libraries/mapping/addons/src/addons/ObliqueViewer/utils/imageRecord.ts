import type { Matrix3RowMajor } from "@carma-commons/math";
import type { TypedConverter } from "@carma-geo/proj";

import type {
  BasicObliqueImageRecord,
  CardinalDirection,
  ExteriorOrientationDataArray,
  ObliqueImageIdInfo,
  ObliqueImageRecord,
} from "../types";
import {
  getApproximateHeadingBySector,
  getCardinalDirectionByLineAndCameraId,
} from "./orientation";

/** the converter from the dataset's CRS to WGS84 */
export type DatasetConverter = TypedConverter<"EPSG:25832", "EPSG:4326">;

/** a WGS84 point in the dataset's CRS; the branded lng/lat types are cast away */
export const wgs84ToDatasetXY = (
  converter: DatasetConverter,
  longitude: number,
  latitude: number
): [number, number] =>
  converter.inverse(
    [longitude, latitude] as unknown as Parameters<DatasetConverter["inverse"]>[0]
  ) as [number, number];

/** `line_waypoint_cameraIdPhoto`, the way the Wuppertal flight names images */
export const unpackIdInfo = (id: string): ObliqueImageIdInfo | null => {
  const [lineIdx, waypointIdx, imageDescription] = id.split("_");
  if (!lineIdx || !waypointIdx || !imageDescription) {
    return null;
  }
  const lineIndex = parseInt(lineIdx, 10);
  const waypointIndex = parseInt(waypointIdx, 10);
  const photoIndex = parseInt(imageDescription.slice(3), 10);
  if (
    !Number.isFinite(lineIndex) ||
    !Number.isFinite(waypointIndex) ||
    !Number.isFinite(photoIndex)
  ) {
    return null;
  }
  return {
    lineIndex,
    waypointIndex,
    cameraId: imageDescription.slice(0, 3),
    photoIndex,
    stationId: `${lineIdx}_${waypointIdx}`,
  };
};

export const mapExtOriArrToRecord = (
  id: string,
  arr: ExteriorOrientationDataArray
): BasicObliqueImageRecord | null => {
  const [x, y, z, row0, row1, row2] = arr;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    console.warn("[OBLIQUE] invalid perspective centre", id, x, y, z);
    return null;
  }
  const unpacked = unpackIdInfo(id);
  if (!unpacked) {
    console.warn("[OBLIQUE] unreadable image id", id);
    return null;
  }
  const m: Matrix3RowMajor = [row0, row1, row2];
  return { id, ...unpacked, x, y, z, m };
};

export const extendObliqueImageRecord = (
  image: BasicObliqueImageRecord,
  converter: DatasetConverter,
  headingOffsetRad: number,
  directionConfig: {
    EVEN: Record<string, CardinalDirection>;
    ODD: Record<string, CardinalDirection>;
  }
): ObliqueImageRecord => {
  const { x, y, z } = image;
  const [longitude, latitude, height] = converter.forward([x, y, z]) as [
    number,
    number,
    number
  ];
  const sector = getCardinalDirectionByLineAndCameraId(
    image.lineIndex,
    image.cameraId,
    directionConfig
  );
  return {
    ...image,
    centerWGS84: [longitude, latitude, height ?? z],
    fallbackHeading: getApproximateHeadingBySector(sector, headingOffsetRad),
    sector,
  };
};
