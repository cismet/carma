import type { CesiumConfig } from "@carma/cesium/types";

/**
 * Validated camera configuration with all required refs
 */

/**
 * Type guard to check if a value is a valid number (including branded types)
 */
const isValidNumber = (value: unknown): value is number => {
  return typeof value === "number" && !isNaN(value) && isFinite(value);
};

/**
 * Validates Cesium config and returns validated camera configuration
 * Throws error if required cameraHomePose is missing
 *
 * This is a pure function - no hooks, config should be static
 */
export const validateCesiumConfig = (config: CesiumConfig): CesiumConfig => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Note: cameraHomePose is now a prop on CesiumContextProvider, not part of config
  // Validation happens in the provider when converting from Portal format

  // Validate cameraHomePose structure if present
  if (config.cameraHomePose) {
    const { longitude, latitude, height } = config.cameraHomePose;

    if (!isValidNumber(longitude)) {
      errors.push("[CesiumConfig] cameraHomePose.longitude must be a number");
    } else if (typeof longitude !== "number") {
      warnings.push(
        "[CesiumConfig] cameraHomePose.longitude should be a plain number (not branded type)"
      );
    }

    if (!isValidNumber(latitude)) {
      errors.push("[CesiumConfig] cameraHomePose.latitude must be a number");
    } else if (typeof latitude !== "number") {
      warnings.push(
        "[CesiumConfig] cameraHomePose.latitude should be a plain number (not branded type)"
      );
    }

    if (!isValidNumber(height)) {
      errors.push("[CesiumConfig] cameraHomePose.height must be a number");
    } else if (typeof height !== "number") {
      warnings.push(
        "[CesiumConfig] cameraHomePose.height should be a plain number (not branded type)"
      );
    }

    // Validate optional orientation
    if (
      config.cameraHomePose.heading !== undefined &&
      !isValidNumber(config.cameraHomePose.heading)
    ) {
      errors.push("[CesiumConfig] cameraHomePose.heading must be a number");
    } else if (
      config.cameraHomePose.heading !== undefined &&
      typeof config.cameraHomePose.heading !== "number"
    ) {
      warnings.push(
        "[CesiumConfig] cameraHomePose.heading should be a plain number (not branded type)"
      );
    }

    if (
      config.cameraHomePose.pitch !== undefined &&
      !isValidNumber(config.cameraHomePose.pitch)
    ) {
      errors.push("[CesiumConfig] cameraHomePose.pitch must be a number");
    } else if (
      config.cameraHomePose.pitch !== undefined &&
      typeof config.cameraHomePose.pitch !== "number"
    ) {
      warnings.push(
        "[CesiumConfig] cameraHomePose.pitch should be a plain number (not branded type)"
      );
    }

    if (
      config.cameraHomePose.roll !== undefined &&
      !isValidNumber(config.cameraHomePose.roll)
    ) {
      errors.push("[CesiumConfig] cameraHomePose.roll must be a number");
    } else if (
      config.cameraHomePose.roll !== undefined &&
      typeof config.cameraHomePose.roll !== "number"
    ) {
      warnings.push(
        "[CesiumConfig] cameraHomePose.roll should be a plain number (not branded type)"
      );
    }
  }

  // Validate cameraInitialPose if present
  if (config.cameraInitialPose) {
    const { longitude, latitude, height } = config.cameraInitialPose;

    if (!isValidNumber(longitude)) {
      errors.push(
        "[CesiumConfig] cameraInitialPose.longitude must be a number"
      );
    } else if (typeof longitude !== "number") {
      warnings.push(
        "[CesiumConfig] cameraInitialPose.longitude should be a plain number (not branded type)"
      );
    }

    if (!isValidNumber(latitude)) {
      errors.push("[CesiumConfig] cameraInitialPose.latitude must be a number");
    } else if (typeof latitude !== "number") {
      warnings.push(
        "[CesiumConfig] cameraInitialPose.latitude should be a plain number (not branded type)"
      );
    }

    if (!isValidNumber(height)) {
      errors.push("[CesiumConfig] cameraInitialPose.height must be a number");
    } else if (typeof height !== "number") {
      warnings.push(
        "[CesiumConfig] cameraInitialPose.height should be a plain number (not branded type)"
      );
    }

    // Validate optional orientation
    if (
      config.cameraInitialPose.heading !== undefined &&
      !isValidNumber(config.cameraInitialPose.heading)
    ) {
      errors.push("[CesiumConfig] cameraInitialPose.heading must be a number");
    } else if (
      config.cameraInitialPose.heading !== undefined &&
      typeof config.cameraInitialPose.heading !== "number"
    ) {
      warnings.push(
        "[CesiumConfig] cameraInitialPose.heading should be a plain number (not branded type)"
      );
    }

    if (
      config.cameraInitialPose.pitch !== undefined &&
      !isValidNumber(config.cameraInitialPose.pitch)
    ) {
      errors.push("[CesiumConfig] cameraInitialPose.pitch must be a number");
    } else if (
      config.cameraInitialPose.pitch !== undefined &&
      typeof config.cameraInitialPose.pitch !== "number"
    ) {
      warnings.push(
        "[CesiumConfig] cameraInitialPose.pitch should be a plain number (not branded type)"
      );
    }

    if (
      config.cameraInitialPose.roll !== undefined &&
      !isValidNumber(config.cameraInitialPose.roll)
    ) {
      errors.push("[CesiumConfig] cameraInitialPose.roll must be a number");
    } else if (
      config.cameraInitialPose.roll !== undefined &&
      typeof config.cameraInitialPose.roll !== "number"
    ) {
      warnings.push(
        "[CesiumConfig] cameraInitialPose.roll should be a plain number (not branded type)"
      );
    }
  }

  // Throw error if validation failed
  if (errors.length > 0) {
    const errorMessage = errors.join("\n");
    throw new Error(`[CesiumConfig Validation Failed]\n${errorMessage}`);
  }

  return config;
};
