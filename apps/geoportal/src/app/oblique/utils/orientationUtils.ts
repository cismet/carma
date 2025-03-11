import { Math as CesiumMath } from "cesium";
import { type CardinalDirection } from "../types";

/**
 * Determines the sector based on the heading angle
 * North: -45° to 45° (or 315° to 45°)
 * East: 45° to 135°
 * South: 135° to 225°
 * West: 225° to 315°
 *
 * @param heading Heading in radians
 * @returns Sector as "N", "E", "S", or "W"
 */
export function getSectorFromHeading(heading: number): CardinalDirection {
  // Convert to degrees for easier understanding
  const degrees = CesiumMath.toDegrees(heading);

  // North is from -45 to 45 degrees (or 315 to 45 in 0-360 system)
  if (degrees >= 315 || degrees < 45) {
    return "N";
  }
  // East is from 45 to 135 degrees
  else if (degrees >= 45 && degrees < 135) {
    return "E";
  }
  // South is from 135 to 225 degrees
  else if (degrees >= 135 && degrees < 225) {
    return "S";
  }
  // West is from 225 to 315 degrees
  else {
    return "W";
  }
}

// calculate approximateheading from camera ID and line number as workaround until OPK approach works.

const CAMERA_ID_TO_DIRECTION = {
  // For even flight lines
  EVEN: {
    // Using common oblique camera IDs
    "170": "E",
    "171": "S",
    "174": "W",
    "176": "N",
  },
  // For odd flight lines
  ODD: {
    "170": "W",
    "171": "N",
    "174": "E",
    "176": "S",
  },
};

const isOddFlightLine = (flightLine: string): boolean => {
  return parseInt(flightLine) % 2 !== 0;
};

export function getCardinalDirectionByLineAndCameraId(
  flightLine: string,
  cameraId: string
): CardinalDirection {
  const direction =
    CAMERA_ID_TO_DIRECTION[isOddFlightLine(flightLine) ? "ODD" : "EVEN"];
  return direction[cameraId];
}

export function getApproximateHeadingBySector(
  sector: CardinalDirection,
  offset: number
): number {
  const headings: Record<CardinalDirection, number> = {
    N: 0,
    E: CesiumMath.toRadians(90),
    S: CesiumMath.toRadians(180),
    W: CesiumMath.toRadians(270),
  };
  return headings[sector] + offset;
}
