import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useHashState } from "./HashStateProvider";
import {
  type MapStyleKey,
  type ManagedEngineKey,
  ManagedEngineKeys,
} from "../constants";
import { useMapStyleBus } from "../hooks/useMapStyleBus";
import type { CesiumConfig } from "@carma-mapping/engines/cesium/types";
import { convertCameraStateToInternalFormat } from "@carma/cesium";
import type { CameraStateHeadingPitchRoll } from "@carma/cesium";
import type { HashStateConfig } from "./HashStateProvider";
import { OverlayTourProvider } from "@carma-commons/ui/helper-overlay";
import { CesiumContextProvider } from "@carma-mapping/engines/cesium/core";
import { CarmaTopicMapContextProvider } from "@carma-mapping/engines/carma-cismap";
import { TransitionContextProvider } from "@carma-mapping/map-transition-2d-3d";
import { LeafletConfig } from "@carma/types";
import { validatePortalCesiumConfig } from "./validate-portal-config";
import { parseInitialPortalState } from "./parse-initial-portal-state";

/**
 * PortalProvider - Complete portal context provider & 2D↔3D orchestrator
 *
 * === ORCHESTRATION FLOW (2D→3D) ===
 * 1. **MapTypeSwitcher** requests 3D mode
 *    → Calls useMapModeToggle().toggle()
 *    → Calls useMapTransition().transitionToMode3d()
 * 
 * 2. **Transition callbacks** handle engine switching
 *    → onTransitionStart emits CtxEvent.Activate (to Cesium context)
 *    → onTransitionStart emits TopicMapCtxEvent.Suspend (to TopicMap)
 *
 * 3. **CesiumMapComponentWrapper** (Portal level) acts as gate
 *    → Receives Activate event
 *    → Sets refs: currentSceneStyleRef.current = initialMapStyle
 *    → Sets refs: initialCamera.current = cameraState
 *    → Allows mount: setShouldMountScene(true)
 *
 * 4. **CesiumSceneComponent** mounts and registers
 *    → Reads refs on mount (style, camera)
 *    → Registers callbacks (style applier)
 *    → Emits SceneReady event
 *
 * 5. **Context** is passive infrastructure
 *    → Owns refs, event bus, static config
 *    → Forwards events (no orchestration logic)
 *    → Scene registers, context doesn't manage
 *
 * === RESPONSIBILITIES ===
 * - READ from URL: Parse hash for map style, engine mode, and location
 * - WRITE to URL: Update hash when state changes
 * - Provide map state (style, engine, position, camera)
 * - Orchestrate engine switching (Activate/Suspend events)
 * - Wrap children with all portal-level providers:
 *   - SelectionProvider (selection state)
 *   - TransitionContextProvider (2D↔3D transitions)
 *   - CarmaTopicMapContextProvider (TopicMap integration)
 *   - OverlayTourProvider (overlay UI)
 *   - CesiumContextProvider (Cesium 3D engine - passive)
 *
 * All initial state must be determined before children render.
 */

export type MapEngine = ManagedEngineKey;

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

// Cesium 3D camera location
// Describes camera position and orientation in 3D space
//
// Two modes supported:
// 1. Absolute positioning: lat/lng/altitude + heading/pitch/roll/fov (used in URL)
// 2. Object-centric: lat/lng/altitude + heading/pitch/range (for home position)
export interface InitialCameraLocation {
  latitude: number;
  longitude: number;
  altitude?: number; // Height above ground/ellipsoid
  heading?: number; // Rotation around z-axis (0 = North)
  pitch?: number; // Rotation around y-axis (tilt, -90 = straight down)
  roll?: number; // Rotation around x-axis (typically 0 for level horizon)
  fov?: number; // Field of view in degrees (absolute positioning)
  range?: number; // Distance from target in meters (object-centric positioning)
}

interface PortalContextType {
  // Initialization state
  isInitialized: boolean;

  // Initial state from URL (stable, doesn't change)
  initialMapStyle: MapStyleKey;
  initialEngine: MapEngine;

  currentMapStyle: MapStyleKey;
  setCurrentMapStyle: (style: MapStyleKey) => void;
  currentEngine: MapEngine;
  setCurrentEngine: (engine: MapEngine) => void;

  // Configuration
  mapStyleToCesiumStyleMapping: Record<MapStyleKey, string>;

  // Initial state (from URL)
  initialMapStyle: MapStyleKey;
  initialEngine: MapEngine;
  initialMapPosition: MapPosition2D;
  initialCameraLocation: InitialCameraLocation;

  // Helpers
  updateMapPosition: (position: Partial<MapPosition2D>) => void;
  updateCameraLocation: (location: Partial<InitialCameraLocation>) => void;

  // Cesium config
  cesiumConfig: CesiumConfig;

  // PortalConfig properties
  portalConfig: PortalConfig;
}

const PortalContext = createContext<PortalContextType | undefined>(undefined);

export interface PortalConfig {
  hashConfig: HashStateConfig;
  styleConfig: MapStyleConfig;

  // Mapping from portal map styles (2D) to Cesium scene styles (3D)
  // This is app-specific - each app defines which Cesium styles match their 2D styles
  mapStyleToCesiumStyleMapping: Record<MapStyleKey, string>;

  // Default positions
  defaultPosition: MapPosition2D;
  homePosition: MapPosition2D;
  defaultCameraLocation?: InitialCameraLocation;
  homePose3d?: InitialCameraLocation;

  // Engine configurations
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
  const {
    styleConfig,
    cesiumConfig,
    defaultPosition,
    defaultCameraLocation,
    homePosition,
    homePose3d,
  } = config;
  const { defaultStyle } = styleConfig;
  const { updateHash, getHashValues } = useHashState();
  const { emit } = useMapStyleBus();
  const [isInitialized, setIsInitialized] = useState(false);

  // Validate Cesium config synchronously before rendering (happens once per component lifetime)
  const validationDoneRef = useRef(false);
  if (!validationDoneRef.current) {
    validationDoneRef.current = true;
    validatePortalCesiumConfig(
      cesiumConfig,
      config.mapStyleToCesiumStyleMapping
    );
  }

  // READ from URL: Get all initial values from hash in one call
  const {
    initialMapStyle,
    initialEngine,
    initialMapPosition,
    initialCameraLocation,
  } = useMemo(() => {
    const hashValues = getHashValues();

    return parseInitialPortalState({
      hashValues,
      styleConfig,
      defaultPosition,
      defaultCameraLocation,
    });
  }, [getHashValues, styleConfig, defaultPosition, defaultCameraLocation]);

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
      {
        engine:
          currentEngine === ManagedEngineKeys.CESIUM_3D
            ? ManagedEngineKeys.CESIUM_3D
            : undefined,
      },
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

  // Engine switching now handled by callbacks in transition functions
  // See use-map-transition.ts for onTransitionStart/onCameraAnimationComplete callbacks

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
      mapStyleToCesiumStyleMapping: config.mapStyleToCesiumStyleMapping,
      updateMapPosition,
      updateCameraLocation,
      cesiumConfig,
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
      cesiumConfig,
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
            <CesiumContextProvider
              config={cesiumConfig}
              homeCameraPose={
                homePose3d || {
                  latitude: homePosition.latitude,
                  longitude: homePosition.longitude,
                  altitude: 10000, // Default altitude if not specified
                  heading: 0,
                  pitch: -90,
                  roll: 0,
                }
              }
              initialCameraPose={
                defaultCameraLocation
                  ? {
                      latitude:
                        defaultCameraLocation.latitude ||
                        defaultPosition.latitude,
                      longitude:
                        defaultCameraLocation.longitude ||
                        defaultPosition.longitude,
                      altitude: defaultCameraLocation.altitude || 10000,
                      heading: defaultCameraLocation.heading || 0,
                      pitch: defaultCameraLocation.pitch || -90,
                      roll: 0,
                    }
                  : undefined
              }
            >
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
