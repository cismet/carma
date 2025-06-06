import { useEffect, useRef } from "react";
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
  /** Animation options for camera restoration */
  restoreOptions?: {
    animate?: boolean;
    duration?: number;
  };
  /** Maximum age of stored camera state in milliseconds */
  maxAge?: number;
}

/**
 * Hook for persisting and restoring Cesium camera state to/from localStorage
 */
export const useCameraPersistence = (
  viewer: Viewer | null,
  options: UseCameraPersistenceOptions = {}
) => {
  const {
    autoSave = true,
    saveDelay = 1000,
    autoRestore = true,
    restoreOptions = { animate: false, duration: 0 },
    maxAge = 24 * 60 * 60 * 1000, // 24 hours
  } = options;

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasRestoredRef = useRef(false);
  const wasRestoredRef = useRef(false); // Track if we successfully restored

  // Check if valid camera state exists synchronously
  const hasValidSavedState = () => {
    const savedState = loadCameraState();
    return isValidCameraState(savedState, maxAge);
  };

  // Auto-restore camera state when viewer is ready
  useEffect(() => {
    if (!viewer || !autoRestore || hasRestoredRef.current) return;

    const savedState = loadCameraState();
    if (isValidCameraState(savedState, maxAge)) {
      applyCameraState(viewer, savedState!, restoreOptions);
      hasRestoredRef.current = true;
      wasRestoredRef.current = true;
      console.debug("[useCameraPersistence] Camera state restored");
    } else {
      hasRestoredRef.current = true; // Mark as processed even if not restored
      wasRestoredRef.current = false;
    }
  }, [viewer, autoRestore, maxAge, restoreOptions]);

  // Auto-save camera state on movement
  useEffect(() => {
    if (!viewer || !autoSave) return;

    const handleCameraChange = () => {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout to debounce rapid camera movements
      saveTimeoutRef.current = setTimeout(() => {
        try {
          const currentState = extractCameraState(viewer);
          saveCameraState(currentState);
        } catch (error) {
          console.warn(
            "[useCameraPersistence] Failed to save camera state:",
            error
          );
        }
      }, saveDelay);
    };

    // Listen to camera movement events
    const removeListener =
      viewer.camera.changed.addEventListener(handleCameraChange);

    return () => {
      removeListener();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [viewer, autoSave, saveDelay]);

  // Manual save/restore functions
  const saveCurrentState = () => {
    if (!viewer) return null;
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
    if (!viewer) return false;

    const stateToRestore = state || loadCameraState();
    if (isValidCameraState(stateToRestore, maxAge)) {
      applyCameraState(viewer, stateToRestore!, restoreOptions);
      return true;
    }
    return false;
  };

  const getCurrentState = (): CameraPersistenceState | null => {
    if (!viewer) return null;
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
    wasRestored: wasRestoredRef.current,
    hasValidSavedState,
  };
};
