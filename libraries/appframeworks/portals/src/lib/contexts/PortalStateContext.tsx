import React, {
  createContext,
  useContext,
  useRef,
  useCallback,
  useEffect,
} from "react";

import { useHashState } from "./HashStateProvider";
import { parseInitialPortalState } from "./parse-initial-portal-state";
import { ManagedEngineKeys } from "../constants";
import type { MapStyleKey } from "../constants";
import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";
import { assembleCurrentMapView } from "./utils/assembleCurrentMapView";

// Import types from types folder
import type {
  MapEngine,
  MapPosition2D,
  CameraLocation,
  MapStyleConfig,
  MapStyleMappings,
} from "../types/portal";
import type { MapView } from "../types/map-view";
import type { CesiumConfig } from "@carma-mapping/engines/cesium/types";
import type { LeafletConfig } from "@carma/types";

// Import individual state hooks
import { useMapStyleState } from "./hooks/use-map-style-state";
import { useMapEngineState } from "./hooks/use-map-engine-state";
import { usePositionState } from "./hooks/use-position-state";

// Interfaces moved from types/portal.ts to be closer to the provider
export interface PortalStateContextType {
  // Initialization state
  isInitialized: boolean;

  // Named hooks for each managed state
  useMapStyle: () => {
    current: MapStyleKey;
    set: (style: MapStyleKey) => void;
    initial: MapStyleKey;
    mapStyleToCesiumStyleMapping: Record<MapStyleKey, string>;
  };

  useMapEngine: () => {
    current: MapEngine;
    set: (engine: MapEngine) => void;
    initial: MapEngine;
  };

  useHomePosition: () => {
    home2D: MapPosition2D;
    home3D: CameraLocation;
    flyToHome: () => void;
  };

  useCurrentPosition: () => {
    currentEngine: MapEngine;
    initial2D: MapPosition2D;
    initial3D: CameraLocation;
    update2D: (position: Partial<MapPosition2D>) => void;
    update3D: (location: Partial<CameraLocation>) => void;
  };

  // Engine initialization tracking
  engineInitState: {
    leaflet2d: boolean;
    cesium3d: boolean;
  };

  // Engine initialization callbacks
  onEngineFirstRequest: (engine: MapEngine) => void;

  // Configuration
  cesiumConfig: CesiumConfig;
  leafletConfig: LeafletConfig;
  portalConfig: {
    styleConfig: MapStyleConfig;
    defaultPosition: MapPosition2D;
    defaultCameraLocation: CameraLocation;
    homePosition: MapPosition2D;
    homePose3d: CameraLocation;
    mapStyleMappings: MapStyleMappings;
    cesium: CesiumConfig;
    leaflet: LeafletConfig;
  };
}

export interface PortalStateProviderProps {
  children: React.ReactNode;
  config: {
    styleConfig: MapStyleConfig;
    defaultPosition: MapPosition2D;
    defaultCameraLocation: CameraLocation;
    homePosition: MapPosition2D;
    homePose3d: CameraLocation;
    mapStyleMappings: MapStyleMappings;
    cesium: CesiumConfig;
    leaflet: LeafletConfig;
  };
}

const PortalContext = createContext<PortalStateContextType | undefined>(
  undefined
);

export const usePortalContext = () => {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error(
      "usePortalContext must be used within PortalContextProvider"
    );
  }
  return context;
};

// PortalStateProviderProps is now imported from types/portal.ts

export const PortalStateProvider: React.FC<PortalStateProviderProps> = ({
  children,
  config,
}) => {
  const { getHashValues, isInitialized: hashInitialized } = useHashState();
  const carmaTopicMapContext = useCarmaTopicMapContext();
  const isInitialized = useRef(false);
  const initialValuesRef = useRef<{
    initialMapStyle: MapStyleKey;
    initialEngine: MapEngine;
    initialMapPosition: MapPosition2D;
    initialCameraLocation: CameraLocation;
  } | null>(null);

  // Top-level refs for engine state management and initialization tracking
  const currentMapStyle = useRef<MapStyleKey>(config.styleConfig.defaultStyle);
  const currentEngine = useRef<MapEngine>(ManagedEngineKeys.LEAFLET_2D);

  // MapView refs for coordination with CarmaTopicMapContext
  const currentMapViewRef = useRef<MapView | null>(null);
  const homeMapViewRef = useRef<MapView | null>(null);

  // Engine initialization state tracking
  const engineInitState = useRef<{
    leaflet2d: boolean;
    cesium3d: boolean;
  }>({
    leaflet2d: false,
    cesium3d: false,
  });

  const {
    styleConfig,
    defaultPosition,
    defaultCameraLocation,
    cesium,
    leaflet,
  } = config;

  const { defaultStyle } = styleConfig;

  // Log initialization state
  console.log("[PortalStateProvider] Render state:", {
    hashInitialized,
    isInitialized: isInitialized.current,
    hasInitialValues: !!initialValuesRef.current,
    defaultStyle,
    defaultPosition,
    defaultCameraLocation,
  });

  // Only fetch initial values once after hash is ready
  if (!initialValuesRef.current && hashInitialized) {
    console.log(
      "[PortalStateProvider] Hash initialized, parsing initial state..."
    );
    const hashValues = getHashValues();
    console.log("[PortalStateProvider] Hash values:", hashValues);

    initialValuesRef.current = parseInitialPortalState({
      hashValues,
      styleConfig,
      defaultPosition,
      defaultCameraLocation,
    });

    console.log(
      "[PortalStateProvider] Parsed initial values:",
      initialValuesRef.current
    );
    isInitialized.current = true;
    console.log("[PortalStateProvider] Portal initialization complete");
  }

  // Set the callback in CarmaTopicMapContext when it's available
  useEffect(() => {
    if (carmaTopicMapContext) {
      carmaTopicMapContext.onMapViewUpdate(() => {
        console.log(
          "[PortalStateProvider] MapView updated - no gate recheck needed"
        );
      });
      console.log(
        "[PortalStateProvider] Set onMapViewUpdate callback in CarmaTopicMapContext"
      );
    }
  }, [carmaTopicMapContext]);

  // Style change callback for immediate Redux sync
  const onStyleChange = useCallback((newStyle: MapStyleKey) => {
    console.log(
      "[PortalStateProvider] Style changed, triggering immediate sync:",
      newStyle
    );
    // This will be handled by PortalReduxSyncProvider
  }, []);

  // Use individual state hooks with top-level refs
  const { useMapStyle } = useMapStyleState(
    currentMapStyle,
    initialValuesRef.current?.initialMapStyle ?? defaultStyle,
    defaultStyle,
    config.mapStyleMappings.cesium,
    onStyleChange
  );

  // Engine initialization callback
  const onEngineFirstRequest = useCallback((engine: MapEngine) => {
    if (engine === ManagedEngineKeys.CESIUM_3D) {
      // Trigger Cesium scene initialization via CesiumContextProvider
      console.log(
        "Cesium engine requested for first time - trigger initialization"
      );
      // TODO: Add callback to CesiumContextProvider for scene initialization
    } else if (engine === ManagedEngineKeys.LEAFLET_2D) {
      console.log(
        "Leaflet engine requested for first time - trigger initialization"
      );
      // TODO: Add callback to LeafletContextProvider for map initialization
    }
  }, []);

  const { useMapEngine } = useMapEngineState(
    currentEngine,
    initialValuesRef.current?.initialEngine ?? ManagedEngineKeys.LEAFLET_2D,
    engineInitState,
    onEngineFirstRequest
  );

  // Position coordination callback for CarmaTopicMapContext
  // Only triggers gate as long as currentMapViewRef is undefined
  const onPositionChange = useCallback(
    (position: {
      current2D: MapPosition2D;
      current3D: CameraLocation;
      home2D: MapPosition2D;
      home3D: CameraLocation;
    }) => {
      // Only update if currentMapViewRef is still undefined (gate not settled yet)
      if (currentMapViewRef.current === null) {
        console.log(
          "[PortalStateProvider] Position changed, coordinating with CarmaTopicMapContext (gate not settled):",
          position
        );

        // Update MapView refs
        currentMapViewRef.current = {
          center: [position.current2D.latitude, position.current2D.longitude],
          zoom: position.current2D.zoom,
        };

        homeMapViewRef.current = {
          center: [position.home2D.latitude, position.home2D.longitude],
          zoom: position.home2D.zoom,
        };

        // Assemble the final currentMapView using helper
        const hashValues = getHashValues();
        const assembledCurrentMapView = assembleCurrentMapView({
          hashValues,
          currentMapView: currentMapViewRef.current,
          homeMapView: homeMapViewRef.current,
          portalConfig: {
            defaultPosition: config.defaultPosition,
            homePosition: config.homePosition,
          },
        });

        console.log(
          "[PortalStateProvider] Assembled currentMapView:",
          assembledCurrentMapView
        );

        if (carmaTopicMapContext) {
          // Set assembled current map view in CarmaTopicMapContext
          carmaTopicMapContext.setCurrentMapView(assembledCurrentMapView);

          // Set home map view (2D only for TopicMap)
          carmaTopicMapContext.setHomeMapView(homeMapViewRef.current);

          console.log(
            "[PortalStateProvider] Set MapViews in CarmaTopicMapContext:",
            {
              currentMapView: assembledCurrentMapView,
              homeMapView: homeMapViewRef.current,
            }
          );
        }
      } else {
        console.log(
          "[PortalStateProvider] Position changed but gate already settled, ignoring update"
        );
      }
    },
    [
      carmaTopicMapContext,
      getHashValues,
      config.defaultPosition,
      config.homePosition,
    ]
  );

  // Callback for home requests - calls engine context's flyHome
  const onHomeRequest = useCallback(
    (position: { home2D: MapPosition2D; home3D: CameraLocation }) => {
      console.log("[PortalProvider] Home requested", position, {
        hasTopicMap: !!carmaTopicMapContext,
      });

      // Call engine context's flyHome callback
      if (currentEngine.current === ManagedEngineKeys.LEAFLET_2D) {
        carmaTopicMapContext?.flyHome();
      } else {
        // TODO: Call CesiumContext's flyHome when implemented
        console.log("[PortalProvider] Cesium flyHome not yet implemented");
      }
    },
    [carmaTopicMapContext, currentEngine]
  );

  const { useCurrentPosition, useHomePosition, isInitialViewResolved } =
    usePositionState(
      initialValuesRef.current?.initialMapPosition ?? defaultPosition,
      initialValuesRef.current?.initialCameraLocation ?? defaultCameraLocation,
      config.homePosition,
      config.homePose3d,
      currentEngine,
      onPositionChange,
      onHomeRequest
    );

  const value: PortalStateContextType = {
    // Initialization state
    isInitialized: isInitialized.current,

    // Named hooks for each managed state
    useMapStyle,
    useMapEngine,
    useHomePosition,
    useCurrentPosition,

    // Engine initialization tracking
    engineInitState: engineInitState.current,
    onEngineFirstRequest,

    // Configuration
    cesiumConfig: cesium,
    leafletConfig: leaflet,
    portalConfig: config,
  };

  // Log gating decisions
  const hasInitialViewResolved = isInitialViewResolved;

  console.log("[PortalStateProvider] Gating check:", {
    hashInitialized,
    hasInitialValues: !!initialValuesRef.current,
    isInitialized: isInitialized.current,
    hasInitialViewResolved,
    willRenderChildren:
      hashInitialized &&
      initialValuesRef.current &&
      isInitialized.current &&
      hasInitialViewResolved,
  });

  // Don't render until hash is ready and initial values are determined
  if (!hashInitialized || !initialValuesRef.current) {
    console.log(
      "[PortalStateProvider] Blocked: hash not ready or no initial values"
    );
    return null;
  }

  // Gate children until initialization is complete AND initial view is resolved
  if (!isInitialized.current || !hasInitialViewResolved) {
    console.log(
      "[PortalStateProvider] Showing loading screen - initialization not complete or initial view not resolved"
    );
    return (
      <PortalContext.Provider value={value}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh",
            fontSize: "18px",
            color: "#666",
          }}
        >
          {!isInitialized.current
            ? "Initializing map..."
            : "Resolving initial view..."}
        </div>
      </PortalContext.Provider>
    );
  }

  console.log(
    "[PortalStateProvider] Rendering children - all initialization complete"
  );
  return (
    <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
  );
};

// Named hooks for managed properties - these are the public API
export const useMapStyle = () => {
  const { useMapStyle: contextUseMapStyle } = usePortalContext();
  return contextUseMapStyle();
};

export const useMapEngine = () => {
  const { useMapEngine: contextUseMapEngine } = usePortalContext();
  return contextUseMapEngine();
};

export const useHomePosition = () => {
  const { useHomePosition: contextUseHomePosition } = usePortalContext();
  return contextUseHomePosition();
};

export const useCurrentPosition = () => {
  const { useCurrentPosition: contextUseCurrentPosition } = usePortalContext();
  return contextUseCurrentPosition();
};
