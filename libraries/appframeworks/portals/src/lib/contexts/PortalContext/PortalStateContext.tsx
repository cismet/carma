import {
  useRef,
  useEffect,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from "react";

import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";
import type { MapView } from "@carma-mapping/engines/leaflet";
import { useCesiumContext } from "@carma/mapping/engines/cesium/core";
import type { CesiumConfig } from "@carma-mapping/engines/cesium/types";
import type { LeafletConfig } from "@carma/types";
import type { CameraState } from "@carma/cesium";
import { TransitionContextProvider } from "../TransitionContext";

import { useHashState } from "../HashStateProvider";

import type { MapEngine, PortalConfig } from "../../types/portal";
import type { HashValues } from "../../types";
import type { EngineRecords } from "../../types/map-engines";

import { getInitialPortalState } from "./get-initial-portal-state";
import { ManagedEngineKeys } from "../../constants";
import { type MapStyleKey } from "../../constants";
import {
  PortalContext,
  type PortalContextType,
  type MapEngineRecord,
} from "./PortalContext";
import { evaluatePortalGate } from "./portal-gate-check";

import { useEnginesRef, useTopicMapSyncCallback } from "./hooks";

/**
 * Static updater function - upserts engine (creates if missing, updates if exists)
 */
const createUpdateEngine = (
  enginesRef: React.MutableRefObject<EngineRecords>,
  forceUpdate: () => void
) => {
  return (engineType: MapEngine, updates: Record<string, unknown>) => {
    const engineIndex = enginesRef.current.findIndex(
      (e) => e.engine === engineType
    );

    if (engineIndex === -1) {
      // CREATE - engine doesn't exist, add it
      const newEngine = {
        engine: engineType,
        isReady: false,
        isSuspended: true,
        ...updates,
      } satisfies MapEngineRecord;

      console.debug("[PortalStateProvider] Engine created:", {
        engineType,
        state: {
          ready: newEngine.isReady,
          suspended: newEngine.isSuspended,
        },
      });

      enginesRef.current = [...enginesRef.current, newEngine];
      forceUpdate();
      return;
    }

    // UPDATE - engine exists, merge updates
    const previousEngine = enginesRef.current[engineIndex];
    const updatedEngine = { ...previousEngine, ...updates } as MapEngineRecord;

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
    forceUpdate();
  };
};

/**
 * Static interceptor for map style changes - notifies engines and callbacks
 */
const createMapStyleInterceptor = (
  forEachActiveEngine: (
    callback: (engine: ManagedEngineRecord) => void
  ) => void,
  topicMapSyncCallbackRef: React.MutableRefObject<
    ((styleId: MapStyleKey) => void) | null
  >
) => {
  return (newStyle: MapStyleKey): MapStyleKey => {
    console.log("[PortalContext] Setting map style to", newStyle);

    // Apply style to all active engines that support setStyle
    forEachActiveEngine((engine) => {
      if ("setStyle" in engine && typeof engine.setStyle === "function") {
        console.log(`[PortalContext] Setting style on ${engine.engine}`);
        engine.setStyle(newStyle);
      }
    });

    // Call topicmap sync callback if registered
    if (topicMapSyncCallbackRef.current) {
      console.log(
        "[PortalContext] Calling topicmap sync callback for style:",
        newStyle
      );
      topicMapSyncCallbackRef.current(newStyle);
    }

    return newStyle;
  };
};

const initialEngines: EngineRecords = [
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

  // Topicmap sync callback ref - allows external registration without prop drilling
  const topicMapSyncCallbackRef = useRef<
    ((styleId: MapStyleKey) => void) | null
  >(null);

  const isPortalInitializedRef = useRef<boolean | null>(null);

  // Refs for state management
  const mapStyleRef = useRef<MapStyleKey>(config.styleConfig.defaultStyle);
  const enginesRef = useRef<EngineRecords>(initialEngines);
  const viewRef = useRef<MapView | null>(null);
  const homeViewRef = useRef<MapView | null>(null);
  const cameraRef = useRef<CameraState | null>(null);
  const homeCameraRef = useRef<CameraState | null>(null);

  // Use extracted hook for active engine management with stable references
  const { activeEngines, forEachActiveEngine, getIsCesiumActive } =
    useEnginesRef(enginesRef);

  // Create map style interceptor (must be memoized for stable reference)
  const mapStyleInterceptor = useMemo(
    () =>
      createMapStyleInterceptor(forEachActiveEngine, topicMapSyncCallbackRef),
    [forEachActiveEngine]
  );

  // Manual getter/setter methods for all refs
  const getMapStyle = useCallback(() => mapStyleRef.current, []);
  const setMapStyle = useCallback((newStyle: MapStyleKey) => {
    const processedStyle = mapStyleInterceptor(newStyle);
    mapStyleRef.current = processedStyle;
  }, [mapStyleInterceptor]);

  const getView = useCallback(() => viewRef.current, []);
  const setView = useCallback((view: MapView | null) => {
    viewRef.current = view;
  }, []);

  const getHomeView = useCallback(() => homeViewRef.current, []);
  const setHomeView = useCallback((view: MapView | null) => {
    homeViewRef.current = view;
  }, []);

  const getHomeCamera = useCallback(() => homeCameraRef.current, []);
  const setHomeCamera = useCallback((camera: CameraState | null) => {
    homeCameraRef.current = camera;
  }, []);

  const getCamera = useCallback(() => {
    const value = cameraRef.current;
    console.log(
      "[PortalContext] 🎥 CAMERA GET - Camera requested from PortalContext:",
      value
    );
    return value;
  }, []);
  const setCamera = useCallback((camera: CameraState | null) => {
    cameraRef.current = camera;
  }, []);

  // Engines getter (special - doesn't use accessors)
  const getEngines = useCallback(() => enginesRef.current, []);

  // Updater function - upserts engine (creates or updates)
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

    // Manual getters/setters
    getMapStyle,
    setMapStyle,
    getView,
    setView,
    getHomeView,
    setHomeView,
    getHomeCamera,
    setHomeCamera,
    getCamera,
    setCamera,

    // Engines (special handling - upsert only)
    getEngines,
    updateEngine,

    portalConfig: config,
    topicMapSyncCallbackRef,
    setTopicMapSyncCallback,
    activeEngines,
    forEachActiveEngine,
    getIsCesiumActive,
  };

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
    <PortalContext.Provider value={value}>
      <TransitionContextProvider
        config={config.transitions}
        getEngines={getEngines}
        updateEngine={updateEngine}
        isCesiumSuspended={
          enginesRef.current.find((e) => e.engine === "cesium3d")?.isSuspended
        }
      >
        {children}
      </TransitionContextProvider>
    </PortalContext.Provider>
  );
};
