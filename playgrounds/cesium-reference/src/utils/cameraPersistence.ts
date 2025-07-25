import {
  Cartesian3,
  PerspectiveFrustum,
  OrthographicFrustum,
  type Viewer,
} from "cesium";

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
  isOrthographic?: boolean; // frustum type
  orthographicWidth?: number; // for orthographic frustum
  timestamp: number;
}

const STORAGE_KEY = "cesium-reference-camera-state";

/**
 * Extracts camera state from a Cesium viewer
 */
export const extractCameraState = (viewer: Viewer): CameraPersistenceState => {
  if (!viewer || viewer.isDestroyed()) {
    console.warn(
      "Viewer is not available or has been destroyed during camera state extraction"
    );
    throw new Error("Viewer is not available or has been destroyed");
  }

  const camera = viewer.camera;
  const position = camera.positionCartographic;

  const isOrthographic = camera.frustum instanceof OrthographicFrustum;
  const fov =
    camera.frustum instanceof PerspectiveFrustum
      ? camera.frustum.fov
      : undefined;
  const orthographicWidth =
    camera.frustum instanceof OrthographicFrustum
      ? camera.frustum.width
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
    isOrthographic,
    orthographicWidth,
    timestamp: Date.now(),
  };
};

/**
 * Applies camera state to a Cesium viewer
 */
export const applyCameraState = (
  viewer: Viewer,
  state: CameraPersistenceState
): void => {
  if (!viewer || viewer.isDestroyed()) {
    console.warn(
      "Viewer is not available or has been destroyed during camera state application"
    );
    throw new Error("Viewer is not available or has been destroyed");
  }

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

  // Restore frustum type first
  if (state.isOrthographic) {
    const canvas = viewer.scene.canvas;
    const aspectRatio = canvas.clientWidth / canvas.clientHeight;

    const orthoFrustum = new OrthographicFrustum();
    orthoFrustum.aspectRatio = aspectRatio;
    orthoFrustum.width = state.orthographicWidth || 2000;

    viewer.scene.camera.frustum = orthoFrustum;
  } else {
    const perspFrustum = new PerspectiveFrustum();
    perspFrustum.fov = state.fov || 1.0471975511965976; // 60 degrees in radians
    perspFrustum.aspectRatio =
      viewer.scene.canvas.clientWidth / viewer.scene.canvas.clientHeight;

    viewer.scene.camera.frustum = perspFrustum;
  }

  viewer.camera.setView({
    destination,
    orientation,
  });

  viewer.scene.requestRender();
};

/**
 * Saves camera state to localStorage
 */
export const saveCameraState = (state: CameraPersistenceState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    //console.debug("Camera state saved to localStorage", state);
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
 * Checks if a camera state is valid
 */
export const isValidCameraState = (
  state: CameraPersistenceState | null
): boolean => {
  if (!state) return false;

  const { longitude, latitude, height } = state.position;
  if (isNaN(longitude) || isNaN(latitude) || isNaN(height)) {
    console.warn("Invalid camera state values", state);
    return false;
  }

  return true;
};
