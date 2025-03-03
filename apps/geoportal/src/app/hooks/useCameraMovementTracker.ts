import { useEffect, useRef, useState } from "react";
import { Viewer, Cartesian3, defined } from "cesium";

type CameraPosition = {
  position: Cartesian3;
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
  timestamp: number;
};

type MovementCallback = (position: CameraPosition) => void;

type CameraMovementTrackerOptions = {
  threshold?: number; // Minimum distance in meters to trigger movement detection
  debounceTime?: number; // Time in ms to wait between updates
  enabled?: boolean; // Whether tracking is initially enabled
};

const defaultOptions: CameraMovementTrackerOptions = {
  threshold: 1.0, // 1 meter
  debounceTime: 200, // 200ms
  enabled: true,
};

/**
 * Hook that tracks camera movement in Cesium viewer
 *
 * @param viewer The Cesium viewer instance
 * @param options Configuration options
 * @returns Controls for the camera movement tracker
 */
export function useCameraMovementTracker(
  viewer: Viewer | null,
  options: CameraMovementTrackerOptions = {}
) {
  const { threshold, debounceTime, enabled } = {
    ...defaultOptions,
    ...options,
  };

  const [isTracking, setIsTracking] = useState(enabled || false);
  const [currentPosition, setCurrentPosition] = useState<CameraPosition | null>(
    null
  );

  const lastUpdateTime = useRef(0);
  const lastPosition = useRef<Cartesian3 | null>(null);
  const callbacksRef = useRef<Set<MovementCallback>>(new Set());
  const preUpdateEventRef = useRef<(() => void) | null>(null);

  // Update camera position and notify listeners
  const updateCameraPosition = () => {
    if (!viewer || !isTracking) return;

    const now = performance.now();
    if (now - lastUpdateTime.current < debounceTime) return;

    const camera = viewer.camera;
    const ellipsoid = viewer.scene.globe.ellipsoid;
    const position = camera.position;

    // Check if we've moved enough to trigger an update
    if (
      lastPosition.current &&
      Cartesian3.distance(position, lastPosition.current) < threshold
    ) {
      return;
    }

    // Get position in geographic coordinates
    const cartographic = ellipsoid.cartesianToCartographic(position);
    const longitude = cartographic.longitude;
    const latitude = cartographic.latitude;
    const height = cartographic.height;

    const newPosition: CameraPosition = {
      position: Cartesian3.clone(position),
      longitude,
      latitude,
      height,
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
      timestamp: now,
    };

    // Update state
    setCurrentPosition(newPosition);
    lastPosition.current = Cartesian3.clone(position);
    lastUpdateTime.current = now;

    // Notify listeners
    callbacksRef.current.forEach((callback) => {
      try {
        callback(newPosition);
      } catch (error) {
        console.error("Error in camera movement callback:", error);
      }
    });
  };

  // Enable or disable tracking
  useEffect(() => {
    if (!viewer) return;

    if (isTracking) {
      // Setup camera movement tracking
      const preUpdateCallback = () => {
        updateCameraPosition();
      };

      viewer.scene.preUpdate.addEventListener(preUpdateCallback);
      preUpdateEventRef.current = () => {
        viewer.scene.preUpdate.removeEventListener(preUpdateCallback);
      };

      // Initial position update
      updateCameraPosition();
    } else if (preUpdateEventRef.current) {
      // Clean up event listener
      preUpdateEventRef.current();
      preUpdateEventRef.current = null;
    }

    // Cleanup on unmount
    return () => {
      if (preUpdateEventRef.current) {
        preUpdateEventRef.current();
        preUpdateEventRef.current = null;
      }
    };
  }, [viewer, isTracking]);

  // Add a movement listener
  const addMovementListener = (callback: MovementCallback) => {
    callbacksRef.current.add(callback);

    // Return function to remove the listener
    return () => {
      callbacksRef.current.delete(callback);
    };
  };

  // Start tracking
  const startTracking = () => {
    setIsTracking(true);
  };

  // Stop tracking
  const stopTracking = () => {
    setIsTracking(false);
  };

  return {
    currentPosition,
    isTracking,
    startTracking,
    stopTracking,
    addMovementListener,
  };
}

export default useCameraMovementTracker;
