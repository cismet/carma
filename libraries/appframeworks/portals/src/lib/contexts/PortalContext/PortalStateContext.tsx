import { useRef, useEffect, useState, useCallback, ReactNode } from "react";

import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";
import type { MapView } from "@carma-mapping/engines/leaflet";
import { useCesiumContext } from "@carma/mapping/engines/cesium/core";
import type { CesiumConfig } from "@carma-mapping/engines/cesium/types";
import type { LeafletConfig } from "@carma/types";
import type { CameraState } from "@carma/cesium";

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
import { evaluatePortalGate } from "./portal-gate-check";

import { useEnginesRef, useMapStyle, useTopicMapSyncCallback } from "./hooks";

/**
 * Static updater functions - extracted to keep component body clean
 */

const createSetEngines = (
  enginesRef: React.MutableRefObject<MapEngineRecord[]>,
  forceUpdate: () => void
) => {
  return (
    engines:
      | MapEngineRecord[]
      | ((prev: MapEngineRecord[]) => MapEngineRecord[])
  ) => {
    const newEngines =
      typeof engines === "function" ? engines(enginesRef.current) : engines;

    console.debug("[PortalStateProvider] Engines updated:", {
      previous: enginesRef.current.map(
        (e) => `${e.engine}: ready=${e.isReady}, suspended=${e.isSuspended}`
      ),
      new: newEngines.map(
        (e) => `${e.engine}: ready=${e.isReady}, suspended=${e.isSuspended}`
      ),
    });

    enginesRef.current = newEngines;
    forceUpdate(); // Trigger re-render to update activeEngines
  };
};

const createUpdateEngine = (
  enginesRef: React.MutableRefObject<MapEngineRecord[]>,
  forceUpdate: () => void
) => {
  return (engineType: MapEngine, updates: Partial<MapEngineRecord>) => {
    const engineIndex = enginesRef.current.findIndex(
      (e) => e.engine === engineType
    );
    if (engineIndex === -1) {
      console.warn(
        "[PortalStateProvider] Engine not found for update:",
        engineType
      );
      return;
    }

    const previousEngine = enginesRef.current[engineIndex];
    const updatedEngine = { ...previousEngine, ...updates };

    console.debug("[PortalStateProvider] Engine updated:", {
      engineType,
      previous: {
        ready: previousEngine.isReady,
        suspended: previousEngine.isSuspended,
      },
      updates,
      result: {
        ready: updatedEngine.isReady,
        suspended: updatedEngine.isSuspended,
      },
    });

    enginesRef.current[engineIndex] = updatedEngine;
    forceUpdate(); // Trigger re-render to update activeEngines
  };
};

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

  // Canonical force update hook
  // See: https://react.dev/reference/react/useState#forcing-a-component-to-reset
  const forceUpdate = useCallback(() => {
    setState({});
  }, []);
  const [, setState] = useState({});

  // Cache the ready state to prevent re-evaluation once ready
  const readyStateCacheRef = useRef<{ ready: boolean; reason: string } | null>(
    null
  );

  // Success callback to run when hash initialization completes
  const onHashInitializationSuccess = () => {
    console.debug(
      "[PortalStateProvider] Hash initialization success callback triggered"
    );
    // Force re-render to check gate again
    forceUpdate();
  };

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
  const cameraRef = useRef<CameraState | null>(null);
  const homeCameraRef = useRef<CameraState | null>(null);

  // Use extracted hook for active engine management with stable references
  const { activeEngines, forEachActiveEngine, isCesiumActive } =
    useEnginesRef(enginesRef);

  // Force re-check when critical dependencies change (only during initialization)
  useEffect(() => {
    // Only re-check if not already ready and hash is initialized
    if (isPortalInitializedRef.current && !readyStateCacheRef.current?.ready) {
      console.debug(
        "[PortalStateProvider] Dependencies changed, re-checking gate"
      );
      forceUpdate();
    }
  }, [
    // Track critical dependencies that affect gate readiness
    mapStyleRef.current,
    viewRef.current,
    cameraRef.current,
    homeViewRef.current,
    homeCameraRef.current,
    enginesRef.current.length, // Track engine count instead of activeEngines
  ]);

  // Getter functions for reading current values
  const getMapStyle = useCallback(() => mapStyleRef.current, []);
  const getEngines = useCallback(() => enginesRef.current, []);
  const getView = useCallback(() => viewRef.current, []);
  const getCamera = useCallback(() => {
    console.log(
      "[PortalContext] 🎥 CAMERA GET - Camera requested from PortalContext:",
      cameraRef.current
    );
    return cameraRef.current;
  }, []);
  const getHomeView = useCallback(() => homeViewRef.current, []);
  const getHomeCamera = useCallback(() => homeCameraRef.current, []);

  // Updater functions - created once using static factory functions
  const setEngines = createSetEngines(enginesRef, forceUpdate);
  const updateEngine = createUpdateEngine(enginesRef, forceUpdate);

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

        // Call success callback
        onHashInitializationSuccess();

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

  // Calculate render state before creating context value
  const renderState = evaluatePortalGate({
    config,
    readyStateCacheRef,
    isPortalInitializedRef,
    enginesRef,
    mapStyleRef,
    viewRef,
    cameraRef,
    homeViewRef,
    homeCameraRef,
  });

  const value: PortalContextType = {
    // Gate status
    passedGate: renderState.ready,

    // Getter functions for reading current values
    getMapStyle,
    getEngines,
    getView,
    getCamera,
    getHomeView,
    getHomeCamera,

    // Updater functions for mutating refs
    setEngines,
    updateEngine,

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

  // DUPLICATE FUNCTION REMOVED - isReadyToRender already defined above

  if (!renderState.ready) {
    console.log(
      "[PortalStateProvider] Gate CLOSED - App cannot render:",
      renderState.reason,
      "\nMissing requirements for initialization:",
      {
        hashInitialized: isPortalInitializedRef.current ? "✅" : "❌",
        activeEngines:
          activeEngines?.length > 0
            ? `✅ (${activeEngines.map((e) => e.engine).join(", ")})`
            : "❌ (none)",
        styleSelected: mapStyleRef.current
          ? `✅ (${mapStyleRef.current})`
          : "❌ (none)",
        homeViewSet: homeViewRef.current || homeCameraRef.current ? "✅" : "❌",
        viewReady: viewRef.current ? "✅" : "❌",
        cameraReady: cameraRef.current ? "✅" : "❌",
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
          }}
        >
          <div>
            <h2>Geoportal wird initialisiert...</h2>
            <p>Gate: {renderState.reason}</p>
          </div>
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
