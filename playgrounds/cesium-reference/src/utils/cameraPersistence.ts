import { Cartesian3, PerspectiveFrustum } from "cesium";
import type { Viewer } from "cesium";

export interface CameraPersistenceState {
  position: {
    longitude: number; // radians
    latitude: number; // radians
    height: number; // meters
  };
  orientation: {
    heading: number; // radians
    pitch: number; // radians
    roll: number; // radians
  };
  fov?: number; // radians
  timestamp: number;
}

const STORAGE_KEY = "cesium-reference-camera-state";

/**
 * Extracts camera state from a Cesium viewer
 */
export const extractCameraState = (viewer: Viewer): CameraPersistenceState => {
  const camera = viewer.camera;
  const position = camera.positionCartographic;

  // Only capture FOV if it's a perspective frustum
  const fov =
    camera.frustum instanceof PerspectiveFrustum
      ? camera.frustum.fov
      : undefined;

  return {
    position: {
      longitude: position.longitude,
      latitude: position.latitude,
      height: position.height,
    },
    orientation: {
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
    },
    fov,
    timestamp: Date.now(),
  };
};

/**
 * Applies camera state to a Cesium viewer
 */
export const applyCameraState = (
  viewer: Viewer,
  state: CameraPersistenceState,
  options: {
    duration?: number;
    animate?: boolean;
  } = {}
): void => {
  const { duration = 0, animate = false } = options;

  const destination = Cartesian3.fromRadians(
    state.position.longitude,
    state.position.latitude,
    state.position.height
  );

  const orientation = {
    heading: state.orientation.heading,
    pitch: state.orientation.pitch,
    roll: state.orientation.roll,
  };

  if (animate && duration > 0) {
    viewer.camera.flyTo({
      destination,
      orientation,
      duration: duration / 1000, // Convert to seconds
    });
  } else {
    viewer.camera.setView({
      destination,
      orientation,
    });
  }

  // Apply FOV if available and camera has a perspective frustum
  if (state.fov && viewer.camera.frustum instanceof PerspectiveFrustum) {
    viewer.camera.frustum.fov = state.fov;
  }

  viewer.scene.requestRender();
};

/**
 * Saves camera state to localStorage
 */
export const saveCameraState = (state: CameraPersistenceState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    console.debug("Camera state saved to localStorage", state);
  } catch (error) {
    console.warn("Failed to save camera state to localStorage:", error);
  }
};

/**
 * Loads camera state from localStorage
 */
export const loadCameraState = (): CameraPersistenceState | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const state = JSON.parse(saved) as CameraPersistenceState;
      console.debug("Camera state loaded from localStorage", state);
      return state;
    }
  } catch (error) {
    console.warn("Failed to load camera state from localStorage:", error);
  }
  return null;
};

/**
 * Clears camera state from localStorage
 */
export const clearCameraState = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.debug("Camera state cleared from localStorage");
  } catch (error) {
    console.warn("Failed to clear camera state from localStorage:", error);
  }
};

/**
 * Checks if a camera state is valid and not too old
 */
export const isValidCameraState = (
  state: CameraPersistenceState | null,
  maxAgeMs: number = 24 * 60 * 60 * 1000 // 24 hours
): boolean => {
  if (!state) return false;

  const age = Date.now() - state.timestamp;
  if (age > maxAgeMs) {
    console.debug("Camera state is too old, ignoring", { age, maxAgeMs });
    return false;
  }

  // Basic validation of position values
  const { longitude, latitude, height } = state.position;
  if (
    isNaN(longitude) ||
    isNaN(latitude) ||
    isNaN(height) ||
    longitude < -Math.PI ||
    longitude > Math.PI ||
    latitude < -Math.PI / 2 ||
    latitude > Math.PI / 2 ||
    height < 0
  ) {
    console.warn("Invalid camera state values", state);
    return false;
  }

  return true;
};
