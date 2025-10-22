import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useHashState } from "./HashStateProvider";
import { type MapStyleKey, isMapStyleKey, MapStyleMapping } from "../constants";
import { useMapStyleBus } from "../hooks/useMapStyleBus";
import type { CesiumConfig } from "@carma-mapping/engines/cesium/core";
import { SelectionProvider } from "../components/SelectionProvider";
import { OverlayTourProvider } from "@carma-commons/ui/helper-overlay";
import { CesiumContextProvider } from "@carma-mapping/engines/cesium/core";
import { CarmaTopicMapContextProvider } from "@carma-mapping/engines/carma-cismap";
import { TransitionContextProvider } from "@carma-mapping/map-transition-2d-3d";

/**
 * PortalProvider - Complete portal context provider
 *
 * Responsibilities:
 * - READ from URL: Parse hash for map style, engine mode, and location
 * - WRITE to URL: Update hash when state changes
 * - Provide map state (style, engine, position, camera)
 * - Wrap children with all portal-level providers:
 *   - SelectionProvider (selection state)
 *   - TransitionContextProvider (2D↔3D transitions)
 *   - CarmaTopicMapContextProvider (TopicMap integration)
 *   - OverlayTourProvider (overlay UI)
 *   - CesiumContextProvider (Cesium 3D engine)
 * - Emit style changes via event bus
 *
 * All initial state must be determined before children render.
 */

export type MapEngine = "cesium3d" | "leaflet2d";

export interface MapStyleConfig {
  defaultStyle: MapStyleKey;
  availableStyles: readonly MapStyleKey[];
}

// 2D map position format (lat/lng/zoom)
// Used by Leaflet and MapLibre
// Note: This is NOT yet unified across all engines - see https://github.com/cismet/carma/issues/214
export interface MapPosition2D {
  latitude: number;
  longitude: number;
  zoom: number;
}

// Cesium 3D camera location (without zoom, uses heading/pitch/range instead)
// Describes camera position and orientation in 3D space
export interface InitialCameraLocation {
  latitude: number;
  longitude: number;
  altitude?: number; // Height above ground
  heading?: number; // Rotation around z-axis
  pitch?: number; // Rotation around y-axis (tilt)
  range?: number; // Distance from target in meters
}

interface PortalContextType {
  // Initialization state
  isInitialized: boolean;

  // Initial state from URL (stable, doesn't change)
  initialMapStyle: MapStyleKey;
  initialEngine: MapEngine;

  // Initial position in 2D format (lat/lng/zoom) - for Leaflet, MapLibre
  initialMapPosition: MapPosition2D;

  // Initial camera in 3D format (lat/lng/altitude/heading/pitch/range) - for Cesium
  initialCameraLocation: InitialCameraLocation;

  // Runtime state (can change via user interaction)
  currentMapStyle: MapStyleKey;
  setCurrentMapStyle: (style: MapStyleKey) => void;

  currentEngine: MapEngine;
  setCurrentEngine: (engine: MapEngine) => void;

  // Location update handlers (called by hash routing hooks)
  updateMapPosition: (position: Partial<MapPosition2D>) => void;
  updateCameraLocation: (camera: Partial<InitialCameraLocation>) => void;

  // Cesium config with initialStyle and initialCamera merged in
  cesiumConfig: CesiumConfig;

  // Portal config
  portalConfig: PortalConfig["portalConfig"];
}

const PortalContext = createContext<PortalContextType | undefined>(undefined);

export interface PortalConfig {
  // Complete portal configuration (single config object)
  portalConfig: {
    // Hash configuration
    hashConfig: {
      fields: Array<{
        key: string;
        valueName?: string;
        codec?: {
          encode?: (value: unknown) => string | undefined;
          decode?: (value: string) => unknown;
        };
      }>;
    };

    // Style configuration
    styleConfig: MapStyleConfig;

    // Position defaults
    defaultPosition: MapPosition2D;
    defaultCameraLocation?: Partial<InitialCameraLocation>;

    // Cesium configuration
    cesiumConfig: CesiumConfig;

    // Overlay UI configuration
    overlayConfig?: {
      transparency?: number;
      color?: string;
    };

    // Transition configuration for 2D↔3D
    transitionsConfig?: any; // TransitionConfig

    // Selection callbacks (TODO: Remove when Redux is fully removed)
    selectionCallbacks?: {
      onSelectionChange?: (selection: any) => void;
      onModelSelectionChange?: (feature: any) => void;
    };
  };
}

interface PortalProviderProps {
  children: ReactNode;
  config: PortalConfig;
}

export const PortalProvider = ({ children, config }: PortalProviderProps) => {
  const {
    styleConfig,
    cesiumConfig,
    defaultPosition,
    defaultCameraLocation,
    selectionCallbacks,
  } = config.portalConfig;
  const { defaultStyle } = styleConfig;
  const { updateHash, getHashValues } = useHashState();
  const { emit } = useMapStyleBus();
  const [isInitialized, setIsInitialized] = useState(false);

  // READ from URL: Get all initial values from hash in one call
  const {
    initialMapStyle,
    initialEngine,
    initialMapPosition,
    initialCameraLocation,
  } = useMemo(() => {
    const hashValues = getHashValues();

    // Map style
    const mapStyle =
      isMapStyleKey(hashValues.mapStyle) &&
      styleConfig.availableStyles.includes(hashValues.mapStyle)
        ? hashValues.mapStyle
        : defaultStyle;

    // Engine (2D vs 3D)
    const engine: MapEngine =
      hashValues.engine === "cesium3d" ? "cesium3d" : "leaflet2d";

    // 2D position format (lat/lng/zoom) - for Leaflet, MapLibre
    const mapPosition: MapPosition2D = {
      latitude: hashValues.lat
        ? parseFloat(hashValues.lat as string)
        : defaultPosition.latitude,
      longitude: hashValues.lng
        ? parseFloat(hashValues.lng as string)
        : defaultPosition.longitude,
      zoom: hashValues.zoom
        ? parseFloat(hashValues.zoom as string)
        : defaultPosition.zoom,
    };

    // 3D camera location (lat/lng/altitude/heading/pitch/range) - for Cesium
    const cameraLocation: InitialCameraLocation = {
      latitude: mapPosition.latitude,
      longitude: mapPosition.longitude,
      altitude: hashValues.h
        ? parseFloat(hashValues.h as string)
        : defaultCameraLocation?.altitude,
      heading: hashValues.heading
        ? parseFloat(hashValues.heading as string)
        : defaultCameraLocation?.heading,
      pitch: hashValues.pitch
        ? parseFloat(hashValues.pitch as string)
        : defaultCameraLocation?.pitch,
      range: hashValues.range
        ? parseFloat(hashValues.range as string)
        : defaultCameraLocation?.range,
    };

    return {
      initialMapStyle: mapStyle,
      initialEngine: engine,
      initialMapPosition: mapPosition,
      initialCameraLocation: cameraLocation,
    };
  }, [
    getHashValues,
    styleConfig.availableStyles,
    defaultStyle,
    defaultPosition,
    defaultCameraLocation,
  ]);

  // Merge initial style and camera location into Cesium config
  const mergedCesiumConfig = useMemo((): CesiumConfig => {
    const cesiumStyleId = MapStyleMapping[initialMapStyle];

    console.log("[PortalProvider] Merging Cesium config:", {
      initialMapStyle,
      cesiumStyleId,
      initialCameraLocation,
      originalConfig: cesiumConfig,
    });

    const merged = {
      ...cesiumConfig,
      sceneStyle: {
        ...cesiumConfig.sceneStyle,
        initialStyle: cesiumStyleId,
      },
      initialCamera: initialCameraLocation,
    };

    console.log("[PortalProvider] Merged Cesium config:", merged);

    return merged;
  }, [cesiumConfig, initialMapStyle, initialCameraLocation]);

  const [currentMapStyle, setCurrentMapStyle] =
    useState<MapStyleKey>(initialMapStyle);

  const [currentEngine, setCurrentEngine] = useState<MapEngine>(initialEngine);

  // WRITE to URL: Update hash when style changes
  useEffect(() => {
    updateHash(
      {
        mapStyle:
          currentMapStyle === defaultStyle ? undefined : currentMapStyle,
      },
      { label: "PortalProvider:style" }
    );
  }, [currentMapStyle, updateHash, defaultStyle]);

  // WRITE to URL: Update hash when engine changes
  // updateHash uses valueName keys, so we use 'engine' which gets encoded to the hash key
  useEffect(() => {
    updateHash(
      { engine: currentEngine === "cesium3d" ? "cesium3d" : undefined },
      { label: "PortalProvider:engine" }
    );
  }, [currentEngine, updateHash]);

  // Emit style changes via event bus
  useEffect(() => {
    emit(currentMapStyle);
  }, [currentMapStyle, emit]);

  // Mark as initialized after first render when state has settled
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Location update handlers (called by hash routing hooks)
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

      updateHash(hashUpdate, { label: "PortalProvider:2d-position" });
    },
    [updateHash]
  );

  const updateCameraLocation = useCallback(
    (camera: Partial<InitialCameraLocation>) => {
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

      updateHash(hashUpdate, { label: "PortalProvider:3d-camera" });
    },
    [updateHash]
  );

  // Memoize context value to prevent unnecessary rerenders
  const value: PortalContextType = useMemo(
    () => ({
      isInitialized,
      initialMapStyle,
      initialEngine,
      initialMapPosition,
      initialCameraLocation,
      currentMapStyle,
      setCurrentMapStyle,
      currentEngine,
      setCurrentEngine,
      updateMapPosition,
      updateCameraLocation,
      cesiumConfig: mergedCesiumConfig,
      portalConfig: config.portalConfig,
    }),
    [
      isInitialized,
      initialMapStyle,
      initialEngine,
      initialMapPosition,
      initialCameraLocation,
      currentMapStyle,
      currentEngine,
      updateMapPosition,
      updateCameraLocation,
      mergedCesiumConfig,
      config.portalConfig,
    ]
  );

  // GATE: Don't render children until initial state has settled
  // This prevents map engines from receiving incomplete/unsettled configs
  if (!isInitialized) {
    return null;
  }

  const { overlayConfig, transitionsConfig } = config.portalConfig;

  return (
    <PortalContext.Provider value={value}>
      <SelectionProvider
        onSelectionChange={selectionCallbacks?.onSelectionChange}
        onModelSelectionChange={selectionCallbacks?.onModelSelectionChange}
      >
        <TransitionContextProvider config={transitionsConfig}>
          <CarmaTopicMapContextProvider infoBoxPixelWidth={350}>
            <OverlayTourProvider
              transparency={overlayConfig?.transparency || 0.7}
              color={overlayConfig?.color || "#000000"}
            >
              <CesiumContextProvider config={mergedCesiumConfig}>
                {children}
              </CesiumContextProvider>
            </OverlayTourProvider>
          </CarmaTopicMapContextProvider>
        </TransitionContextProvider>
      </SelectionProvider>
    </PortalContext.Provider>
  );
};

export const usePortal = () => {
  const context = useContext(PortalContext);
  if (context === undefined) {
    throw new Error("usePortal must be used within a PortalProvider");
  }
  return context;
};

// Backward compatibility aliases
export const useMapStateUrlSync = usePortal;

export const useMapStyle = () => {
  const { currentMapStyle, setCurrentMapStyle, initialMapStyle } = usePortal();
  return {
    currentStyle: currentMapStyle,
    setCurrentStyle: setCurrentMapStyle,
    initialStyle: initialMapStyle,
  };
};
