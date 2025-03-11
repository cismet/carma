import { type Converter } from "proj4";
import { BasicObliqueImageRecord, ObliqueImageRecord } from "../types";
import {
  getApproximateHeadingBySector,
  getCardinalDirectionByLineAndCameraId,
} from "./orientationUtils";
import { Cartesian3 } from "cesium";
import { computeOrientations } from "./computeOrientations";

export const extendObliqueImageRecord = (
  image: BasicObliqueImageRecord,
  converter: Converter,
  offset: number
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
    image.cameraId
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
