import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MapPosition2D,
  CameraLocation,
  MapEngine,
} from "../../types/portal";
import { ManagedEngineKeys } from "../../constants";
import { useHashState } from "../HashStateProvider";

/**
 * Combined Position state management hook
 * Handles both current position and home position with fallback logic
 */
export const usePositionState = (
  initialMapPosition: MapPosition2D,
  initialCameraLocation: CameraLocation,
  homePosition: MapPosition2D,
  homePose3d: CameraLocation,
  currentEngine: React.MutableRefObject<MapEngine>,
  onPositionChange?: (position: {
    current2D: MapPosition2D;
    current3D: CameraLocation;
    home2D: MapPosition2D;
    home3D: CameraLocation;
  }) => void,
  onHomeRequest?: (position: {
    home2D: MapPosition2D;
    home3D: CameraLocation;
  }) => void
) => {
  // Track when initial view is resolved for gate control
  const isInitialViewResolved = useRef(false);
  const [isInitialViewResolvedState, setIsInitialViewResolvedState] =
    useState(false);
  const { updateHash, getHashValues } = useHashState();

  // Determine current position with fallback logic: URL → initial → home
  const current2D = useMemo(() => {
    const hashValues = getHashValues();
    console.log("[usePositionState] Determining current2D:", {
      hashValues,
      initialMapPosition,
      homePosition,
    });

    // Check URL hash for current position
    if (
      typeof hashValues.latitude === "number" &&
      typeof hashValues.longitude === "number"
    ) {
      const urlPosition = {
        latitude: hashValues.latitude as number,
        longitude: hashValues.longitude as number,
        zoom:
          typeof hashValues.zoom === "number"
            ? hashValues.zoom
            : initialMapPosition.zoom,
      };
      console.log("[usePositionState] Using URL position:", urlPosition);
      return urlPosition;
    }

    // Fallback to initial position
    if (initialMapPosition) {
      console.log(
        "[usePositionState] Using initial position:",
        initialMapPosition
      );
      return initialMapPosition;
    }

    // Final fallback to home position
    console.log(
      "[usePositionState] Using home position fallback:",
      homePosition
    );
    return homePosition;
  }, [getHashValues, initialMapPosition, homePosition]);

  const current3D = useMemo(() => {
    const hashValues = getHashValues();
    console.log("[usePositionState] Determining current3D:", {
      hashValues,
      initialCameraLocation,
      homePose3d,
    });

    // Check URL hash for current camera
    if (
      typeof hashValues.latitude === "number" &&
      typeof hashValues.longitude === "number"
    ) {
      const urlCamera = {
        latitude: hashValues.latitude as number,
        longitude: hashValues.longitude as number,
        altitude:
          typeof hashValues.altitude === "number"
            ? hashValues.altitude
            : initialCameraLocation.altitude,
        heading:
          typeof hashValues.heading === "number"
            ? hashValues.heading
            : initialCameraLocation.heading,
        pitch:
          typeof hashValues.pitch === "number"
            ? hashValues.pitch
            : initialCameraLocation.pitch,
        range:
          typeof hashValues.range === "number"
            ? hashValues.range
            : initialCameraLocation.range,
      };
      console.log("[usePositionState] Using URL camera:", urlCamera);
      return urlCamera;
    }

    // Fallback to initial camera location
    if (initialCameraLocation) {
      console.log(
        "[usePositionState] Using initial camera:",
        initialCameraLocation
      );
      return initialCameraLocation;
    }

    // Final fallback to home camera
    console.log("[usePositionState] Using home camera fallback:", homePose3d);
    return homePose3d;
  }, [getHashValues, initialCameraLocation, homePose3d]);

  const updateMapPosition = useCallback(
    (position: Partial<MapPosition2D>) => {
      const hashUpdate: Record<string, string | number | undefined> = {};

      if (position.latitude !== undefined) {
        hashUpdate.lat = position.latitude.toFixed(7);
      }
      if (position.longitude !== undefined) {
        hashUpdate.lng = position.longitude.toFixed(7);
      }
      if (position.zoom !== undefined) {
        hashUpdate.zoom = position.zoom;
      }

      // Clear 3D camera params when updating 2D position
      hashUpdate.heading = undefined;
      hashUpdate.pitch = undefined;
      hashUpdate.range = undefined;

      // Automatically update hash when position changes
      updateHash(hashUpdate, { label: "PortalStateProvider:2d-position" });
    },
    [updateHash]
  );

  const updateCameraLocation = useCallback(
    (camera: Partial<CameraLocation>) => {
      const hashUpdate: Record<string, string | number | undefined> = {};

      if (camera.latitude !== undefined) {
        hashUpdate.lat = camera.latitude.toFixed(7);
      }
      if (camera.longitude !== undefined) {
        hashUpdate.lng = camera.longitude.toFixed(7);
      }
      if (camera.altitude !== undefined) {
        hashUpdate.h = camera.altitude.toFixed(1);
      }
      if (camera.heading !== undefined) {
        hashUpdate.heading = camera.heading.toFixed(2);
      }
      if (camera.pitch !== undefined) {
        hashUpdate.pitch = camera.pitch.toFixed(2);
      }
      if (camera.range !== undefined) {
        hashUpdate.range = camera.range.toFixed(1);
      }

      // Clear zoom when updating 3D camera
      hashUpdate.zoom = undefined;

      // Automatically update hash when camera location changes
      updateHash(hashUpdate, { label: "PortalStateProvider:3d-camera" });
    },
    [updateHash]
  );

  const flyToHome = useCallback(() => {
    console.log("[usePositionState] flyToHome called", {
      homePosition,
      homePose3d,
    });

    // Call engine context's flyHome callback
    onHomeRequest?.({ home2D: homePosition, home3D: homePose3d });

    // Also update hash (for URL sync)
    if (currentEngine.current === ManagedEngineKeys.CESIUM_3D) {
      updateCameraLocation(homePose3d);
    } else {
      updateMapPosition(homePosition);
    }
  }, [
    homePosition,
    homePose3d,
    currentEngine,
    updateCameraLocation,
    updateMapPosition,
    onHomeRequest,
  ]);

  // Coordinate position data with external context (e.g., CarmaTopicMapContext)
  // Only trigger onPositionChange until initial view is resolved (for gate control)
  useEffect(() => {
    if (onPositionChange && !isInitialViewResolved.current) {
      console.log(
        "[usePositionState] Initial view resolved, triggering onPositionChange"
      );
      onPositionChange({
        current2D,
        current3D,
        home2D: homePosition,
        home3D: homePose3d,
      });
      isInitialViewResolved.current = true;
      setIsInitialViewResolvedState(true); // Trigger re-render
    }
  }, [current2D, current3D, homePosition, homePose3d, onPositionChange]);

  const useCurrentPosition = useCallback(() => {
    const result = {
      currentEngine: currentEngine.current,
      initial2D: current2D,
      initial3D: current3D,
      update2D: updateMapPosition,
      update3D: updateCameraLocation,
    };
    console.log("[usePositionState] useCurrentPosition result:", result);
    return result;
  }, [
    current2D,
    current3D,
    currentEngine,
    updateMapPosition,
    updateCameraLocation,
  ]);

  const useHomePosition = useCallback(() => {
    const result = {
      home2D: homePosition,
      home3D: homePose3d,
      flyToHome,
    };
    console.log("[usePositionState] useHomePosition result:", result);
    return result;
  }, [homePosition, homePose3d, flyToHome]);

  return {
    useCurrentPosition,
    useHomePosition,
    flyToHome,
    current2D,
    current3D,
    home2D: homePosition,
    home3D: homePose3d,
    isInitialViewResolved: isInitialViewResolvedState,
  };
};
