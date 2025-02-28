import { BasicObliqueImageRecord, ObliqueImageRecord } from "./types";
import proj4 from "proj4";

export const extendObliqueImageRecord = (
  image: BasicObliqueImageRecord,
  converter: proj4.Converter
): ObliqueImageRecord => {
  const { x, y, z } = image.perspectiveCenter;

  // Parse ID to extract waypoint ID and direction
  const parts = image.id.split("_");
  // Format is like: 039_168_170004735
  // Waypoint ID is everything before the second underscore (e.g., 039_168)
  // Direction is the first three characters after the second underscore (e.g., 170)

  let waypointId = "unknown";
  let direction: string | null = null;

  if (parts.length >= 3) {
    waypointId = `${parts[0]}_${parts[1]}`;
    const directionPart = parts[2];
    if (directionPart.length >= 3) {
      direction = directionPart.substring(0, 3);
    }
  }

  const record: ObliqueImageRecord = {
    ...image,
    centerWGS84: converter.forward([x, y, z]) as [number, number, number],
    waypointId,
    direction,
  };
  return record;
};
