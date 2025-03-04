import { Math as CesiumMath } from "cesium";
import { ExteriorOrientationOPK } from "../types";

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
export function getSectorFromHeading(heading: number): string {
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

/**
 * Converts photogrammetric OPK angles (Omega, Phi, Kappa) to aviation YPR angles (Yaw, Pitch, Roll) in WGS84
 * Based on the relationship described in the Pix4D documentation
 * @param omega Rotation around the X-axis in radians
 * @param phi Rotation around the Y-axis in radians
 * @param kappa Rotation around the Z-axis in radians
 * @returns Object containing heading (yaw), pitch, and roll in radians in WGS84 coordinates
 */
export function calculateHPRfromOPK(
  { omega, phi, kappa }: ExteriorOrientationOPK,
  offsets: { heading?: number; pitch?: number; roll?: number } = {
    heading: +CesiumMath.PI_OVER_TWO,
    pitch: 0,
    roll: 0,
  }
): { heading?: number; pitch?: number; roll?: number } {
  // Calculate rotation matrix elements
  const sinOmega = Math.sin(omega);
  const cosOmega = Math.cos(omega);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinKappa = Math.sin(kappa);
  const cosKappa = Math.cos(kappa);

  // Calculate full rotation matrix (photogrammetric convention)
  const r11 = cosKappa * cosPhi;
  const r12 = sinKappa * cosPhi;
  const r13 = -sinPhi;
  const r21 = -sinKappa * cosOmega + cosKappa * sinPhi * sinOmega;
  const r22 = cosKappa * cosOmega + sinKappa * sinPhi * sinOmega;
  const r23 = cosPhi * sinOmega;
  const r31 = sinKappa * sinOmega + cosKappa * sinPhi * cosOmega;
  const r32 = -cosKappa * sinOmega + sinKappa * sinPhi * cosOmega;
  const r33 = cosPhi * cosOmega;

  // Convert to WGS84/aviation convention (YPR)
  // Pitch (theta) - rotation about the y-axis
  const pitch = Math.asin(-r13);

  // Heading/Yaw (psi) - rotation about the z-axis
  // Use atan2 to get the correct quadrant
  const heading = Math.atan2(r12, r11) + offsets.heading;

  // Roll (phi) - rotation about the x-axis
  // Use atan2 to get the correct quadrant
  const roll = Math.atan2(r23, r33);

  return {
    heading,
    pitch,
    roll,
  };
}
