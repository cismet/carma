import { Cartesian3 } from "cesium";

import {
  BasicObliqueImageRecord,
  ExteriorOrientationDataArray,
  ObliqueImageRecord,
  Proj4Converter,
} from "../types";
import {
  getCardinalDirectionByLineAndCameraId,
  getApproximateHeadingBySector,
  CardinalDirectionEnum,
} from "./orientationUtils";
import type { Matrix3RowMajor } from "@carma-commons/types";

// TODO: quite specific for the provided, should be more generic or standardized
const unpackIdInfo = (id: string) => {
  const [lineIdx, waypointIdx, imageDescription] = id.split("_");
  const cameraId = imageDescription.slice(0, 3);
  const photoIndex = parseInt(imageDescription.slice(3));
  const stationId = `${lineIdx}_${waypointIdx}`;
  const lineIndex = parseInt(lineIdx);
  const waypointIndex = parseInt(waypointIdx);
  return {
    lineIndex,
    waypointIndex,
    cameraId,
    photoIndex,
    stationId,
  };
};

export const extendObliqueImageRecord = (
  image: BasicObliqueImageRecord,
  { converter }: Proj4Converter,
  offset: number,
  fallbackDirectionConfig: Record<string, Record<string, CardinalDirectionEnum>>
): ObliqueImageRecord => {
  const { x, y, z } = image;

  // Use the provided converter directly instead of creating a new one
  const wgs84Coords = converter.forward([x, y, z]);
  const cartesian = Cartesian3.fromDegrees(
    wgs84Coords[0],
    wgs84Coords[1],
    wgs84Coords[2]
  );

  // Calculate heading and sector if orientation data is available
  const sector = getCardinalDirectionByLineAndCameraId(
    image.lineIndex,
    image.cameraId,
    fallbackDirectionConfig
  );

  let flightPatternHeading = getApproximateHeadingBySector(sector, offset);

  const record: ObliqueImageRecord = {
    ...image,
    centerWGS84: wgs84Coords as [number, number, number],
    cartesian,
    fallbackHeading: flightPatternHeading,
    sector,
  };
  return record;
};

export const mapExtOriArrToRecord = (
  id: string,
  arr: ExteriorOrientationDataArray
): BasicObliqueImageRecord => {
  const x = arr[0];
  const y = arr[1];
  const z = arr[2];
  const row0 = arr[3];
  const row1 = arr[4];
  const row2 = arr[5];
  const m: Matrix3RowMajor = [row0, row1, row2];

  if (isNaN(x) || isNaN(y) || isNaN(z)) {
    console.warn("invalid perspective center:", id, x, y, z);
    return null;
  }

  const unpacked = unpackIdInfo(id);

  return {
    id,
    ...unpacked,
    x,
    y,
    z,
    m,
  };
};
