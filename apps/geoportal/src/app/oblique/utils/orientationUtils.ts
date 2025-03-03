import { Math as CesiumMath } from "cesium";

/**
 * Calculates the heading (azimuth) from omega, phi, and kappa angles
 * @param omega Rotation around the X-axis in radians
 * @param phi Rotation around the Y-axis in radians
 * @param kappa Rotation around the Z-axis in radians
 * @returns Heading in radians (0-2π, clockwise from North)
 */
export function calculateHeadingFromOrientation(
  omega: number,
  phi: number,
  kappa: number
): number {
  // For a simple approximation, kappa directly represents the heading
  // This works well for near-nadir images
  let heading = kappa;

  // Normalize to 0-2π range
  heading = ((heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  return heading;
}

/**
 * Calculates a more accurate heading using the full rotation matrix
 * This is more accurate for oblique images with significant tilt
 * @param omega Rotation around the X-axis in radians
 * @param phi Rotation around the Y-axis in radians
 * @param kappa Rotation around the Z-axis in radians
 * @returns Heading in radians (0-2π, clockwise from North)
 */
export function calculateAccurateHeadingFromOrientation(
  omega: number,
  phi: number,
  kappa: number
): number {
  // Calculate rotation matrix elements
  // These formulas represent the standard photogrammetric rotation matrix
  const sinOmega = Math.sin(omega);
  const cosOmega = Math.cos(omega);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinKappa = Math.sin(kappa);
  const cosKappa = Math.cos(kappa);

  // Calculate rotation matrix elements (simplified for heading calculation)
  const m11 = cosKappa * cosPhi;
  const m12 = sinKappa * cosPhi;
  const m21 = -sinKappa * cosOmega + cosKappa * sinPhi * sinOmega;
  const m22 = cosKappa * cosOmega + sinKappa * sinPhi * sinOmega;

  // Calculate heading (azimuth) from the rotation matrix
  // This represents the direction the camera is pointing
  let heading = Math.atan2(m12, m22);

  // Add 180 degrees (π radians) to correct the orientation
  heading += Math.PI;

  // Normalize to 0-2π range
  heading = ((heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  return heading;
}

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
 * Calculates the tilt angle of the camera from omega and phi
 * @param omega Rotation around the X-axis in radians
 * @param phi Rotation around the Y-axis in radians
 * @returns Tilt angle in radians
 */
export function calculateTiltFromOrientation(
  omega: number,
  phi: number
): number {
  // Calculate the tilt angle using the rotation matrix
  const sinOmega = Math.sin(omega);
  const cosOmega = Math.cos(omega);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);

  // The tilt is the angle between the camera's optical axis and the nadir direction
  const tilt = Math.acos(cosPhi * cosOmega);

  return tilt;
}
