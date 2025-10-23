import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useHashState } from "./HashStateProvider";
import { type MapStyleKey, isMapStyleKey, MapStyleMapping } from "../constants";
import { useMapStyleBus } from "../hooks/useMapStyleBus";
import type { CesiumConfig } from "@carma-mapping/engines/cesium/types";
import { convertCameraStateToInternalFormat } from "@carma/cesium";
import type { CameraStateHeadingPitchRoll } from "@carma/cesium";
import type { HashStateConfig } from "./HashStateProvider";
import { OverlayTourProvider } from "@carma-commons/ui/helper-overlay";
import {
  CesiumContextProvider,
  useCesiumContext,
} from "@carma-mapping/engines/cesium/core";
import {
  CarmaTopicMapContextProvider,
  useCarmaTopicMapContext,
} from "@carma-mapping/engines/carma-cismap";
import {
  TransitionContextProvider,
  useTransitionContext,
  TransitionCtxEvent,
} from "@carma-mapping/map-transition-2d-3d";
import { LeafletConfig } from "@carma/types";

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

  // PortalConfig properties
  portalConfig: PortalConfig;
}

const PortalContext = createContext<PortalContextType | undefined>(undefined);

export interface PortalConfig {
  hashConfig: HashStateConfig;
  styleConfig: MapStyleConfig;

  // Position defaults
  defaultPosition: MapPosition2D;
  // todo unify with defaultPosition, for now use position with altitude plus heading pitch roll(!) camera based
  defaultCameraLocation?: Partial<InitialCameraLocation>;
  homePosition: MapPosition2D;
  // todo unify with homePosition, for now use position with altitude plus heading pitch range(!) object based
  homePose3d?: Partial<InitialCameraLocation>;

  leafletConfig: LeafletConfig;
  cesiumConfig: CesiumConfig;
  overlayConfig?: {
    transparency?: number;
    color?: string;
  };

  // Transition configuration for 2D↔3D
  transitionsConfig?: any; // TransitionConfig

  // UI configuration
  infoBoxPixelWidth?: number; // Default: 350

  // App configuration
  appBasePath?: string;
  iconPrefix?: string;
  configBaseUrl?: string;
  minMobileWidth?: number;
}

interface PortalProviderProps {
  children: ReactNode;
  config: PortalConfig;
}

export const PortalProvider = ({ children, config }: PortalProviderProps) => {
  const { styleConfig, cesiumConfig, defaultPosition, defaultCameraLocation } =
    config;
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

    // Convert InitialCameraLocation to CameraStateHeadingPitchRoll format
    // Both use the same structure, just need to ensure all required fields are present
    const initialCameraState = initialCameraLocation
      ? ({
          latitude: initialCameraLocation.latitude,
          longitude: initialCameraLocation.longitude,
          altitude: initialCameraLocation.altitude,
          heading: initialCameraLocation.heading,
          pitch: initialCameraLocation.pitch,
          roll: 0, // InitialCameraLocation doesn't have roll, default to 0
        } as CameraStateHeadingPitchRoll)
      : undefined;

    const defaultCameraState = defaultCameraLocation
      ? ({
          latitude: defaultCameraLocation.latitude,
          longitude: defaultCameraLocation.longitude,
          altitude: defaultCameraLocation.altitude,
          heading: defaultCameraLocation.heading,
          pitch: defaultCameraLocation.pitch,
          roll: 0, // InitialCameraLocation doesn't have roll, default to 0
        } as CameraStateHeadingPitchRoll)
      : undefined;

    const merged = {
      ...cesiumConfig,
      sceneStyle: cesiumConfig.sceneStyle,
      initialStyle: cesiumStyleId,
      initialCamera: initialCameraLocation,
      cameraInitialPose: initialCameraState
        ? convertCameraStateToInternalFormat(initialCameraState)
        : undefined,
      cameraHomePose: defaultCameraState
        ? convertCameraStateToInternalFormat(defaultCameraState)
        : undefined,
    };

    console.log("[PortalProvider] Merged Cesium config:", merged);

    return merged;
  }, [
    cesiumConfig,
    initialMapStyle,
    initialCameraLocation,
    defaultCameraLocation,
  ]);

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

  // Subscribe to transition events to update engine state and emit engine activation/suspension
  // This centralizes ALL engine availability control close to PortalContext
  const TransitionEngineSync = () => {
    const { subscribe } = useTransitionContext();
    const { emit: emitCesium } = useCesiumContext();
    const { emit: emitTopicMap } = useCarmaTopicMapContext();

    useEffect(() => {
      // Import event types dynamically to avoid circular deps
      const setupListeners = async () => {
        const { CtxEvent } = await import("@carma-mapping/engines/cesium/core");
        const { TopicMapCtxEvent } = await import(
          "@carma-mapping/engines/carma-cismap"
        );

        const unsubscribeTo3dStart = subscribe(
          TransitionCtxEvent.TransitionTo3dStart,
          () => {
            console.debug(
              "[PortalProvider] Transition to 3D: Activating Cesium, suspending TopicMap"
            );
            // Update UI state
            setCurrentEngine("cesium3d");
            
            // Activate Cesium engine
            emitCesium(CtxEvent.Activate, {
              source: "portal-transition",
              component: "TransitionEngineSync",
              reason: "2D→3D transition started",
            });
            
            // Suspend TopicMap engine
            emitTopicMap(TopicMapCtxEvent.Suspend, undefined);
          }
        );

        const unsubscribeTo2dStart = subscribe(
          TransitionCtxEvent.TransitionTo2dStart,
          () => {
            console.debug(
              "[PortalProvider] Transition to 2D: Activating TopicMap, suspending Cesium"
            );
            // Update UI state
            setCurrentEngine("leaflet2d");
            
            // Activate TopicMap engine
            emitTopicMap(TopicMapCtxEvent.Activate, undefined);
            
            // Suspend Cesium engine
            emitCesium(CtxEvent.Suspend, undefined);
          }
        );

        return () => {
          unsubscribeTo3dStart();
          unsubscribeTo2dStart();
        };
      };

      let cleanup: (() => void) | undefined;
      setupListeners().then((fn) => {
        cleanup = fn;
      });

      return () => {
        cleanup?.();
      };
    }, [subscribe, emitCesium, emitTopicMap]);

    return null;
  };

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
      portalConfig: config,
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
      config,
    ]
  );

  // GATE: Don't render children until initial state has settled
  // This prevents map engines from receiving incomplete/unsettled configs
  if (!isInitialized) {
    return null;
  }

  const { overlayConfig, transitionsConfig, infoBoxPixelWidth = 350 } = config;

  return (
    <PortalContext.Provider value={value}>
      <TransitionContextProvider config={transitionsConfig}>
        <CarmaTopicMapContextProvider infoBoxPixelWidth={infoBoxPixelWidth}>
          <OverlayTourProvider
            transparency={overlayConfig?.transparency || 0.7}
            color={overlayConfig?.color || "#000000"}
          >
            <CesiumContextProvider config={mergedCesiumConfig}>
              <TransitionEngineSync />
              {children}
            </CesiumContextProvider>
          </OverlayTourProvider>
        </CarmaTopicMapContextProvider>
      </TransitionContextProvider>
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
