import { useEffect, useRef, useState } from "react";
import type { Viewer } from "cesium";

import {
  extractCameraState,
  applyCameraState,
  saveCameraState,
  loadCameraState,
  isValidCameraState,
  type CameraPersistenceState,
} from "../utils/cameraPersistence";

interface UseCameraPersistenceOptions {
  /** Whether to automatically save camera state changes */
  autoSave?: boolean;
  /** Debounce delay for auto-save in milliseconds */
  saveDelay?: number;
  /** Whether to automatically restore camera state on initialization */
  autoRestore?: boolean;
}

/**
 * Hook for persisting and restoring Cesium camera state to/from localStorage
 */
export const useCameraPersistence = (
  viewer: Viewer | null,
  options: UseCameraPersistenceOptions = {}
) => {
  const { autoSave = true, saveDelay = 1000, autoRestore = true } = options;

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstSaveRef = useRef(true);
  const [wasRestored, setWasRestored] = useState(false);

  const hasValidSavedState = () => {
    const savedState = loadCameraState();
    return isValidCameraState(savedState);
  };

  // Auto-restore camera state when viewer is ready
  useEffect(() => {
    if (!viewer || !autoRestore || viewer.isDestroyed()) return;

    const restoreCamera = async () => {
      try {
        const savedState = loadCameraState();
        if (isValidCameraState(savedState)) {
          applyCameraState(viewer, savedState!);
          setWasRestored(true);
          console.debug("[useCameraPersistence] Camera state restored");
        } else {
          setWasRestored(false);
        }
      } catch (error) {
        console.warn(
          "[useCameraPersistence] Failed to restore camera state:",
          error
        );
        setWasRestored(false);
      }
    };

    restoreCamera();
  }, [viewer, autoRestore]);

  // Auto-save camera state on movement
  useEffect(() => {
    if (!viewer || !autoSave || viewer.isDestroyed()) return;

    const handleCameraChange = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const saveCamera = () => {
        if (!viewer || viewer.isDestroyed()) {
          console.debug(
            "[useCameraPersistence] Viewer destroyed during save timeout, skipping save"
          );
          return;
        }

        try {
          const currentState = extractCameraState(viewer);
          saveCameraState(currentState);
        } catch (error) {
          console.warn(
            "[useCameraPersistence] Failed to save camera state:",
            error
          );
        }
      };

      // First save happens immediately, subsequent saves are throttled
      if (isFirstSaveRef.current) {
        isFirstSaveRef.current = false;
        saveCamera();
      } else {
        saveTimeoutRef.current = setTimeout(saveCamera, saveDelay);
      }
    };

    let removeListener: (() => void) | null = null;
    try {
      removeListener =
        viewer.camera.changed.addEventListener(handleCameraChange);
    } catch (error) {
      console.warn(
        "[useCameraPersistence] Failed to add camera change listener:",
        error
      );
      return;
    }

    return () => {
      if (removeListener) {
        try {
          removeListener();
        } catch (error) {
          console.warn(
            "[useCameraPersistence] Failed to remove camera change listener:",
            error
          );
        }
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [viewer, autoSave, saveDelay]);

  const saveCurrentState = () => {
    if (!viewer || viewer.isDestroyed()) return null;
    try {
      const state = extractCameraState(viewer);
      saveCameraState(state);
      return state;
    } catch (error) {
      console.warn(
        "[useCameraPersistence] Failed to save camera state:",
        error
      );
      return null;
    }
  };

  const restoreState = (state?: CameraPersistenceState) => {
    if (!viewer || viewer.isDestroyed()) return false;

    try {
      const stateToRestore = state || loadCameraState();
      if (isValidCameraState(stateToRestore)) {
        applyCameraState(viewer, stateToRestore!);
        setWasRestored(true);
        return true;
      }
    } catch (error) {
      console.warn(
        "[useCameraPersistence] Failed to restore camera state:",
        error
      );
    }
    setWasRestored(false);
    return false;
  };

  const getCurrentState = (): CameraPersistenceState | null => {
    if (!viewer || viewer.isDestroyed()) return null;
    try {
      return extractCameraState(viewer);
    } catch (error) {
      console.warn(
        "[useCameraPersistence] Failed to extract camera state:",
        error
      );
      return null;
    }
  };

  return {
    saveCurrentState,
    restoreState,
    getCurrentState,
    wasRestored,
    hasValidSavedState,
  };
};
