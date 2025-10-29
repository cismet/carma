import { useRef, useEffect, ReactNode } from "react";

import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";
import type { MapView } from "@carma-mapping/engines/leaflet";
import { useCesiumContext } from "@carma/mapping/engines/cesium/core";
import type { CesiumConfig } from "@carma-mapping/engines/cesium/types";
import type { LeafletConfig } from "@carma/types";
import type { CameraPrimitive } from "@carma/cesium";

import { useHashState } from "../HashStateProvider";

import type { MapEngine, PortalConfig } from "../../types/portal";
import type { HashValues } from "../../types";

import { getInitialPortalState } from "./get-initial-portal-state";
import { ManagedEngineKeys } from "../../constants";
import { type MapStyleKey } from "../../constants";
import {
  PortalContext,
  type PortalContextType,
  type MapEngineRecord,
} from "./PortalContext";

import { useEnginesRef, useMapStyle, useTopicMapSyncCallback } from "./hooks";

const initialEngines: MapEngineRecord[] = [
  {
    engine: "leaflet2d",
    isReady: false,
    isSuspended: true,
  },
  {
    engine: "cesium3d",
    isReady: false,
    isSuspended: true,
  },
];

export interface PortalStateProviderProps {
  children: ReactNode;
  config: PortalConfig;
}

export const PortalStateProvider = ({
  children,
  config,
}: PortalStateProviderProps) => {
  const { onHashInitialized } = useHashState();

  // consider generic refSubscription approach if we get more customers and refs to monitor

  // Topicmap sync callback ref - allows external registration without prop drilling
  const topicMapSyncCallbackRef = useRef<
    ((styleId: MapStyleKey) => void) | null
  >(null);

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

  // Use extracted hook for active engine management with stable references
  const { activeEngines, forEachActiveEngine, isCesiumActive } =
    useEnginesRef(enginesRef);

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
          config,
          hashValues,
          enginesRef,
          mapStyleRef,
          viewRef,
          homeViewRef,
          cameraRef,
          homeCameraRef
        );

        isPortalInitializedRef.current = true;

        console.log(
          "[PortalStateProvider] Initialization complete",
          mapStyleRef.current,
          enginesRef.current,
          viewRef.current,
          cameraRef.current,
          homeViewRef.current,
          homeCameraRef.current
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Extract internal hooks for better organization
  const { setMapStyle } = useMapStyle(
    mapStyleRef,
    forEachActiveEngine,
    topicMapSyncCallbackRef
  );
  const { setTopicMapSyncCallback } = useTopicMapSyncCallback(
    topicMapSyncCallbackRef
  );

  const value: PortalContextType = {
    // Core refs
    enginesRef,
    mapStyleRef,
    viewRef,
    cameraRef,
    homeViewRef,
    homeCameraRef,
    portalConfig: config,
    // Callback refs
    topicMapSyncCallbackRef,
    // Style management
    setMapStyle,
    // Callback registration (simplified)
    setTopicMapSyncCallback,
    // Engine state
    activeEngines,
    forEachActiveEngine,
    isCesiumActive,
  };

  // Stateless gating: check all required values are set before rendering
  const isReadyToRender = () => {
    // Portal must be initialized from hash
    if (!isPortalInitializedRef.current) {
      return { ready: false, reason: "hash not initialized" };
    }

    // Must have an active engine
    if (!activeEngines || activeEngines.length === 0) {
      return { ready: false, reason: "no active engine" };
    }

    // Must have a style selected
    if (!mapStyleRef.current) {
      return { ready: false, reason: "no style selected" };
    }

    // Must have home views set (used for home button and crash recovery)
    if (!homeViewRef.current && !homeCameraRef.current) {
      return { ready: false, reason: "no home view set" };
    }

    // Check based on active engine type
    const hasActive2d = activeEngines.some((e) => e.engine === "leaflet2d");
    const hasActive3d = activeEngines.some((e) => e.engine === "cesium3d");

    if (hasActive2d && !viewRef.current) {
      return { ready: false, reason: "2D view not ready" };
    }

    if (hasActive3d && !cameraRef.current) {
      return { ready: false, reason: "3D camera not ready" };
    }

    return { ready: true, reason: "ready" };
  };

  const renderState = isReadyToRender();

  if (!renderState.ready) {
    console.log(
      "[PortalStateProvider] Blocked:",
      renderState.reason,
      "- Portal state:",
      {
        initialized: isPortalInitializedRef.current,
        activeEngines: activeEngines?.map((e) => e.engine),
        style: mapStyleRef.current,
        view: viewRef.current,
        camera: cameraRef.current,
        homeView: homeViewRef.current,
        homeCamera: homeCameraRef.current,
      }
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
          Geoportal wird initialisiert...
        </div>
      </PortalContext.Provider>
    );
  }

  console.log(
    "[PortalStateProvider] Rendering children -",
    renderState.reason,
    "- State:",
    {
      activeEngines: activeEngines?.map((e) => e.engine),
      style: mapStyleRef.current,
      view: viewRef.current,
      camera: cameraRef.current,
    }
  );
  return (
    <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
  );
};
