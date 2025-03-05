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
 * Converts photogrammetric OPK angles (Omega, Phi, Kappa) to aviation YPR angles (Yaw, Pitch, Roll)
 * This implementation calculates the full rotation matrix and extracts the effective heading
 * parallel to the ground
 *
 * @param omega Rotation around the X-axis in radians
 * @param phi Rotation around the Y-axis in radians
 * @param kappa Rotation around the Z-axis in radians
 * @returns Object containing heading (yaw), pitch, and roll in radians
 */
export function calculateHPRfromOPK({
  omega,
  phi,
  kappa,
}: ExteriorOrientationOPK): {
  heading?: number;
  pitch?: number;
  roll?: number;
} {
  // Calculate rotation matrix elements
  const sinOmega = Math.sin(omega);
  const cosOmega = Math.cos(omega);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinKappa = Math.sin(kappa);
  const cosKappa = Math.cos(kappa);

  // Calculate full rotation matrix (photogrammetric convention)
  // This is the standard OPK rotation matrix used in photogrammetry
  // R = R_kappa * R_phi * R_omega
  const r31 = sinKappa * sinOmega + cosKappa * sinPhi * cosOmega;
  const r32 = -cosKappa * sinOmega + sinKappa * sinPhi * cosOmega;
  const r33 = cosPhi * cosOmega;


  let heading: number;

  heading = Math.atan2(-r32, -r31);

  // Normalize to [0, 2π)
  const normalizedHeading =
    ((heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  // Calculate pitch as the angle between the viewing direction and the horizontal plane
  const horizontalLength = Math.sqrt(r31 * r31 + r32 * r32);
  const pitch = Math.atan2(-r33, horizontalLength);

  // Calculate roll (bank angle) - this is more complex and requires additional calculations
  // For simplicity, we'll use a reasonable approximation based on omega
  const roll = omega;

  return {
    heading: normalizedHeading,
    pitch,
    roll,
  };
}
