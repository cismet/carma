import {
  BasicObliqueImageRecord,
  ExteriorOrientationDataArray,
  ExteriorOrientationRecord,
  ObliqueImageRecord,
  Proj4Converter,
} from "../types";
import {
  getCardinalDirectionByLineAndCameraId,
  getApproximateHeadingBySector,
  CardinalDirectionEnum,
} from "./orientationUtils";
import { Cartesian3 } from "cesium";
import { computeOrientations } from "./computeOrientations";
import { Matrix3RowMajor } from "types/math";

export const extendObliqueImageRecord = (
  image: BasicObliqueImageRecord,
  { converter }: Proj4Converter,
  offset: number,
  fallbackDirectionConfig: Record<string, Record<string, CardinalDirectionEnum>>
): ObliqueImageRecord => {
  const { x, y, z } = image.perspectiveCenter;

  // Use the provided converter directly instead of creating a new one
  const wgs84Coords = converter.forward([x, y, z]);
  const cartesian = Cartesian3.fromDegrees(
    wgs84Coords[0],
    wgs84Coords[1],
    wgs84Coords[2]
  );

  // Calculate heading and sector if orientation data is available
  const sector = getCardinalDirectionByLineAndCameraId(
    image.lineNumber,
    image.cameraId,
    fallbackDirectionConfig
  );

  let flightPatternHeading = getApproximateHeadingBySector(sector, offset);

  const { quaternion, hpr, rotationMatrix } = computeOrientations(
    image.orientation
  );

  // Adjust the heading for the coordinate system if needed
  //heading = adjustHeadingToWGS84(heading, image.perspectiveCenter, converter);

  const record: ObliqueImageRecord = {
    ...image,
    centerWGS84: wgs84Coords as [number, number, number],
    cartesian,
    fallbackHeading: flightPatternHeading,
    sector,
    quaternion,
    hpr,
    rotationMatrix,
  };
  return record;
};

export const mapExtOriArrToRecord = (
  id: string,
  arr: ExteriorOrientationDataArray
): ExteriorOrientationRecord => {
  const x = arr[0];
  const y = arr[1];
  const z = arr[2];
  const row0 = arr[3];
  const row1 = arr[4];
  const row2 = arr[5];
  const m: Matrix3RowMajor = [row0, row1, row2];
  return {
    id,
    x,
    y,
    z,
    m,
  };
};
