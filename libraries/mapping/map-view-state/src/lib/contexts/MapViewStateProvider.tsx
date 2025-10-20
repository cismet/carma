import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Camera } from "@carma/cesium";
import type { CameraStateDegrees } from "../adapters/cesiumAdapter";

import { MapViewStateContext, type MapMode } from "./MapViewStateContext";
import {
  cameraToState,
  encodeCameraState,
  decodeCesiumCamera,
  cesiumClearParamKeys,
} from "../adapters/cesiumAdapter";
import {
  encodeLeafletMap,
  decodeLeafletMap,
  type LeafletMapState,
} from "../adapters/leafletAdapter";

// Hook interface from HashStateProvider (external dependency)
type UseHashStateReturn = {
  hashParams: Record<string, string>;
  updateHash: (
    params: Record<string, unknown> | undefined,
    options?: { clearKeys?: string[]; replace?: boolean }
  ) => void;
};

type MapViewStateProviderProps = {
  children: ReactNode;
  /**
   * Hook to access hash state from HashStateProvider
   * Must be provided from parent context
   */
  useHashState: () => UseHashStateReturn;
  /**
   * Initial mode - defaults to "2d"
   */
  initialMode?: MapMode;
};

/**
 * MapViewStateProvider
 *
 * Centralized provider for map view state management.
 * - Translates hash params to typed position objects
 * - Handles browser navigation
 * - Tracks 2D/3D mode state
 */
export const MapViewStateProvider = ({
  children,
  useHashState,
  initialMode = "2d",
}: MapViewStateProviderProps) => {
  const { hashParams, updateHash } = useHashState();
  const [mode, setMode] = useState<MapMode>(initialMode);

  // Safety check for hashParams
  const safeHashParams = hashParams || {};

  // Decode hash params to typed position objects
  const cesiumState = useMemo(() => {
    try {
      return decodeCesiumCamera(safeHashParams);
    } catch (error) {
      console.warn("[MapViewState] Failed to decode Cesium state:", error);
      return null;
    }
  }, [safeHashParams]);

  const leafletState = useMemo(() => {
    try {
      return decodeLeafletMap(safeHashParams);
    } catch (error) {
      console.warn("[MapViewState] Failed to decode Leaflet state:", error);
      return null;
    }
  }, [safeHashParams]);

  // Update Cesium position (from camera change)
  const updateCesiumPosition = useCallback(
    (cameraOrState: Camera | CameraStateDegrees) => {
      try {
        // Convert Camera to CameraState if needed
        const state =
          cameraOrState instanceof Camera
            ? cameraToState(cameraOrState)
            : cameraOrState;

        // Encode CameraState to URL hash parameters
        const encoded = encodeCameraState(state);

        // Update hash with encoded params
        updateHash(encoded, { replace: true });

        console.debug("[MapViewState] Updated Cesium position:", state);
      } catch (error) {
        console.error(
          "[MapViewState] Failed to update Cesium position:",
          error
        );
      }
    },
    [updateHash]
  );

  // Update Leaflet position (from map move)
  const updateLeafletPosition = useCallback(
    (state: LeafletMapState) => {
      try {
        const encoded = encodeLeafletMap(state);

        // When switching to 2D, clear 3D-specific params
        updateHash(encoded, {
          clearKeys: cesiumClearParamKeys,
          replace: true,
        });

        console.debug("[MapViewState] Updated Leaflet position:", encoded);
      } catch (error) {
        console.error(
          "[MapViewState] Failed to update Leaflet position:",
          error
        );
      }
    },
    [updateHash]
  );

  // Handle mode changes - clear mode-specific params
  useEffect(() => {
    console.debug("[MapViewState] Mode changed to:", mode);

    // When switching to 2D, clear 3D params (but keep lat/lng)
    if (mode === "2d" && cesiumState) {
      updateHash(
        {},
        {
          clearKeys: cesiumClearParamKeys,
          replace: true,
        }
      );
    }
  }, [mode, cesiumState, updateHash]);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      cesiumState,
      leafletState,
      updateCesiumPosition,
      updateLeafletPosition,
      hashParams,
    }),
    [
      mode,
      cesiumState,
      leafletState,
      updateCesiumPosition,
      updateLeafletPosition,
      hashParams,
    ]
  );

  console.debug("[MapViewState] Provider state:", {
    mode,
    hasCesiumState: !!cesiumState,
    hasLeafletState: !!leafletState,
    hashParamKeys: Object.keys(safeHashParams),
  });

  return (
    <MapViewStateContext.Provider value={value}>
      {children}
    </MapViewStateContext.Provider>
  );
};
