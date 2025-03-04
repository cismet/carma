import { type Converter } from "proj4";
import { BasicObliqueImageRecord, ObliqueImageRecord } from "../types";
import { calculateHPRfromOPK, getSectorFromHeading } from "./orientationUtils";
import { adjustHeadingToWGS84 } from "./crsUtils";

export const extendObliqueImageRecord = (
  image: BasicObliqueImageRecord,
  converter: Converter
): ObliqueImageRecord => {
  const { x, y, z } = image.perspectiveCenter;

  // Parse ID to extract waypoint ID and camera ID
  const parts = image.id.split("_");
  // Format is like: 039_168_170004735
  // Waypoint ID is everything before the second underscore (e.g., 039_168)
  // Camera ID is the first three characters after the second underscore (e.g., 170)

  let waypointId = "unknown";
  let cameraId: string | null = null;

  if (parts.length >= 3) {
    waypointId = `${parts[0]}_${parts[1]}`;
    const cameraIdPart = parts[2];
    if (cameraIdPart.length >= 3) {
      cameraId = cameraIdPart.substring(0, 3);
    }
  }

  // Use the provided converter directly instead of creating a new one
  const wgs84Coords = converter.forward([x, y, z]);

  // Calculate heading and sector if orientation data is available
  let heading: number | undefined;
  let sector: string | undefined;

  if (image.orientation) {
    // Get the heading from OPK angles
    ({ heading } = calculateHPRfromOPK(image.orientation));

    // Adjust the heading for the coordinate system if needed
    // Use the existing converter that was passed to this function
    //heading = adjustHeadingToWGS84(heading, image.perspectiveCenter, converter);

    sector = getSectorFromHeading(heading);
  }

  const record: ObliqueImageRecord = {
    ...image,
    centerWGS84: wgs84Coords as [number, number, number],
    waypointId,
    cameraId,
    calculatedHeading: heading,
    sector,
  };
  return record;
};
