import type { CesiumConfig } from "@carma/cesium/types";
import type {
  CameraPoseDegrees,
  CameraStateHeadingPitchRoll,
} from "@carma/cesium";

/**
 * Validated camera configuration with all required refs
 */

/**
 * Validates Cesium config and returns validated camera configuration
 * Throws error if required cameraHomePose is missing
 *
 * This is a pure function - no hooks, config should be static
 */
export const validateCesiumConfig = (config: CesiumConfig): CesiumConfig => {
  const errors: string[] = [];

  // Validate required cameraHomePose
  if (!config.cameraHomePose) {
    errors.push(
      "[CesiumConfig] Missing required cameraHomePose. " +
        "Home camera position is required for go-home functionality."
    );
  }

  // Validate cameraHomePose structure if present
  if (config.cameraHomePose) {
    const { longitude, latitude, height } = config.cameraHomePose;

    if (typeof longitude !== "number") {
      errors.push("[CesiumConfig] cameraHomePose.longitude must be a number");
    }
    if (typeof latitude !== "number") {
      errors.push("[CesiumConfig] cameraHomePose.latitude must be a number");
    }
    if (typeof height !== "number") {
      errors.push("[CesiumConfig] cameraHomePose.height must be a number");
    }

    // Validate optional orientation
    if (
      config.cameraHomePose.heading !== undefined &&
      typeof config.cameraHomePose.heading !== "number"
    ) {
      errors.push("[CesiumConfig] cameraHomePose.heading must be a number");
    }
    if (
      config.cameraHomePose.pitch !== undefined &&
      typeof config.cameraHomePose.pitch !== "number"
    ) {
      errors.push("[CesiumConfig] cameraHomePose.pitch must be a number");
    }
    if (
      config.cameraHomePose.roll !== undefined &&
      typeof config.cameraHomePose.roll !== "number"
    ) {
      errors.push("[CesiumConfig] cameraHomePose.roll must be a number");
    }
  }

  // Validate cameraInitialPose if present
  if (config.cameraInitialPose) {
    const { longitude, latitude, altitude } = config.cameraInitialPose;

    if (typeof longitude !== "number") {
      errors.push(
        "[CesiumConfig] cameraInitialPose.longitude must be a number"
      );
    }
    if (typeof latitude !== "number") {
      errors.push("[CesiumConfig] cameraInitialPose.latitude must be a number");
    }
    if (typeof altitude !== "number") {
      errors.push("[CesiumConfig] cameraInitialPose.altitude must be a number");
    }

    // Validate optional orientation
    if (
      config.cameraInitialPose.heading !== undefined &&
      typeof config.cameraInitialPose.heading !== "number"
    ) {
      errors.push("[CesiumConfig] cameraInitialPose.heading must be a number");
    }
    if (
      config.cameraInitialPose.pitch !== undefined &&
      typeof config.cameraInitialPose.pitch !== "number"
    ) {
      errors.push("[CesiumConfig] cameraInitialPose.pitch must be a number");
    }
    if (
      config.cameraInitialPose.roll !== undefined &&
      typeof config.cameraInitialPose.roll !== "number"
    ) {
      errors.push("[CesiumConfig] cameraInitialPose.roll must be a number");
    }
  }

  // Throw error if validation failed
  if (errors.length > 0) {
    const errorMessage = errors.join("\n");
    throw new Error(`[CesiumConfig Validation Failed]\n${errorMessage}`);
  }

  return config;
};
