import React, {
  createContext,
  useContext,
  useRef,
  useCallback,
  useEffect,
  useState,
  MutableRefObject,
  ReactNode,
} from "react";

import { useHashState } from "./HashStateProvider";
import { getInitialPortalState } from "./get-initial-portal-state";
import { ManagedEngineKeys } from "../constants";
import type { MapStyleKey } from "../constants";
import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";

// Import types from types folder
import type {
  MapEngine,
  MapPosition2D,
  PortalConfig,
} from "../types/portal";
import type { MapView } from "@carma-mapping/engines/leaflet";
import type { CesiumConfig } from "@carma-mapping/engines/cesium/types";
import type { LeafletConfig } from "@carma/types";


import { useCesiumContext } from "@carma/mapping/engines/cesium/core";


type BasicEngineRecord = {
  engine: MapEngine;
  isReady: false;
  isSuspended: true;
}

type LeafletEngineRecord = BasicEngineRecord & {
  engine: ManagedEngineKeys.LEAFLET_2D;
  isReady: true;
  isSuspended: boolean;
  zoomOut: (onComplete?: () => void) => void;
  zoomIn: (onComplete?: () => void) => void;
  flyHome: (onComplete?: () => void) => void;
  setView: (position: MapPosition2D) => void;
  id: string;
  debug: {
    config: LeafletConfig;
    timestamp: number;
  };
};

type CesiumEngineRecord = BasicEngineRecord & {
  engine: ManagedEngineKeys.CESIUM_3D;
  isReady: true;
  isSuspended: boolean;
  zoomOut: (onComplete?: () => void) => void;
  zoomIn: (onComplete?: () => void) => void;
  fovZoomOut?: (onComplete?: () => void) => void;
  fovZoomIn?: (onComplete?: () => void) => void;
  flyHome: (onComplete?: () => void) => void;
  setCamera: (camera: CameraState) => void;
  setStyle: (styleId: string) => void;
  debug: {
    config: CesiumConfig;
    timestamp: number;
  };
};

type MapEngineRecord = LeafletEngineRecord | CesiumEngineRecord | BasicEngineRecord;

const initialEngines: MapEngineRecord = [
  {
    engine: ManagedEngineKeys.LEAFLET_2D,
    isReady: false,
    isSuspended: true,
    },
  {
    engine: ManagedEngineKeys.CESIUM_3D,
    isReady: false,
    isSuspended: true,
  },
];

// Interfaces moved from types/portal.ts to be closer to the provider
export interface PortalStateContextType {
  // no Initialization state needed, gating provider
  mapStyleRef: MutableRefObject<MapStyleKey>;
  // allow for multiple engines to be active at same time for synced views
  enginesRef: MutableRefObject<MapEngineRecord[]>;
  // consider adding currentEnginesRef for parallel updates
  // current state is also initial state for all engines on start
  // no early abstraction here. MapView is LeafletLike View
  // no early abstraction here. CameraLocation is LeafletLike CameraLocation
  viewRef: MutableRefObject<MapView | null>; 
  cameraRef: MutableRefObject<CameraStatePrimitive | null>;
  // home Positions
  homeViewRef: MutableRefObject<MapView | null>;
  homeCameraRef: MutableRefObject<CameraStatePrimitive | null>;
  // Configuration
  portalConfig: PortalConfig;
}

const PortalContext = createContext<PortalStateContextType | undefined>(
  undefined
);

export interface PortalStateProviderProps {
  children: ReactNode;
  config: PortalConfig;
}

export const PortalStateProvider = ({
  children,
  config,
}: PortalStateProviderProps) => {

  const { onHashInitialized } = useHashState();

  const carmaTopicMapContext = useCarmaTopicMapContext();
  const cesiumContext = useCesiumContext();
  // add maplibre here later

  const isPortalInitializedRef = useRef<boolean | null>(null);

  // Top-level refs for engine state management and initialization tracking
  const mapStyleRef = useRef<MapStyleKey>(config.styleConfig.defaultStyle);
  const enginesRef = useRef<MapEngineRecord[]>(initialEngines);
  // MapView refs for coordination with engines
  // 2D
  const viewRef = useRef<MapView | null>(null);
  const homeViewRef = useRef<MapView | null>(null);
  // 3D
  const cameraRef = useRef<CameraPrimitive | null>(null);
  const homeCameraRef = useRef<CameraPrimitive | null>(null);

  // Initialize state from hash and config when hash is ready
  useEffect(() => {
    onHashInitialized((hashValues) => {
      if (isPortalInitializedRef.current === null) {
        console.log(
          "[PortalStateProvider] Initializing from hash values",
          hashValues
        );

        // Parse initial state from hash
        // update Refs
        getInitialPortalState(
          hashValues,
          config,
          enginesRef,
          mapStyleRef,
          viewRef,  
          cameraRef,
          homeViewRef,
          homeCameraRef,
        );

        isPortalInitializedRef.current = true;

        console.log("[PortalStateProvider] Initialization complete", {
          mapStyle: mapStyleRef.current,
          engine: currentEngine.current,
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  

  const value: PortalStateContextType = {
    // todo provide flyHome and setView etc methods
    enginesRef,
    mapStyleRef,
    viewRef,
    cameraRef,
    homeViewRef,
    homeCameraRef,
    portalConfig: config,
  };

  // Don't render until hash is ready and initial values are determined
  if (!isReady || !initialValuesRef.current) {
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
            ? "Geoportal wird initialisiert..."
            : "Ansicht wird geladen..."}
        </div>
      </PortalContext.Provider>
    );
  }

  console.log(
    "[PortalStateProvider] Rendering children - all initialization complete",
    mapStyleRef.current,
    currentEnginesRef.current,
    currentMapViewRef.current,
  );
  return (
    <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
  );
};

export const usePortalContext = () => {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error(
      "usePortalContext must be used within PortalContextProvider"
    );
  }
  return context;
};
