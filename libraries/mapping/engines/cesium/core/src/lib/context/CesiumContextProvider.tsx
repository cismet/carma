import React, { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import type {
  CesiumTerrainProvider,
  ImageryLayer,
  CesiumWidget,
  Cesium3DTileset,
  Scene,
  Model,
} from "@carma/cesium";
import { createEventBus } from "@carma/providers/event-bus";

import {
  CesiumContext,
  type CesiumContextType,
  type CesiumInstanceRecord,
} from "./CesiumContext";
import type { CesiumContextEventMap } from "./cesium-context-event-map";
import { setupCesiumEnvironment } from "../scene/environment";

import {
  useContextSetupSubscriptions,
  useContextSetupInitialStyle,
  useContextSetupCameraTracking,
  useContextSetupActivationListener,
  useContextSetupErrorRecovery,
} from "./hooks";
// DISABLED: Provider loaders for minimal mode
// import {
//   useImageryProviderLoader,
//   useImageryLayer,
//   useTerrainProviderLoader,
//   useSurfaceProviderLoader,
//   useModelsLoader,
// } from "./hooks/useCesiumProviderLoaders";

import type { AnimationMap } from "@carma/types";
import type { CesiumConfig } from "../types";
import type { CameraViewOptions } from "../types/camera";

import { initAnimationMap } from "../scene/camera/animations";
import { sceneRequestRender } from "../scene/scene-request-render";

export const CesiumContextProvider = ({
  children,
  config,
  view,
  initialStyleId,
}: {
  children: ReactNode;
  config: CesiumConfig;
  view?: CameraViewOptions | CameraPoseHeadingPitchRoll;
  initialStyleId?: string;
}): React.ReactElement => {
  // Auto-setup Cesium environment if not already done
  // This ensures window.CESIUM_BASE_URL is set without requiring app-level setup
  if (!window.CESIUM_BASE_URL) {
    setupCesiumEnvironment(config);
  }

  const { screenSpaceCameraController, sceneStyle } = config;

  // Remount key for error recovery - incrementing this will force widget re-initialization
  const [remountKey, setRemountKey] = useState(0);

  // Use refs for Cesium instances to prevent re-renders
  const widgetRef = useRef<CesiumWidget | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const animationMapRef = useRef<AnimationMap | null>(initAnimationMap());

  // Track last camera state for crash recovery
  const lastCameraStateRef = useRef<
    import("@carma/cesium/types").CameraStatePrimitive | null
  >(null);

  // Provider refs - use Maps for arbitrary numbers of providers per type
  const terrainProvidersRef = useRef<Map<string, CesiumTerrainProvider>>(
    new Map()
  );
  const imageryLayersRef = useRef<Map<string, ImageryLayer>>(new Map());
  const tilesetsRef = useRef<Map<string, Cesium3DTileset>>(new Map());
  const modelsRef = useRef<Map<string, Model>>(new Map());

  // State refs
  // Start suspended (2D mode) by default - app should begin in 2D mode
  // Will be activated (3D mode) only when explicitly requested
  const isSuspendedRef = useRef(true);
  const isAnimatingRef = useRef(false);
  const suspendSSCCRef = useRef(false);
  const transitionStateRef = useRef<string | null>(null);
  const shouldSuspendPitchLimiterRef = useRef(false);
  const shouldSuspendCameraLimitersRef = useRef(false);

  // Camera controller settings from config
  const minZoomDistanceRef = useRef<number>(
    screenSpaceCameraController?.minimumZoomDistance ?? 1
  );
  const maxZoomDistanceRef = useRef<number>(
    screenSpaceCameraController?.maximumZoomDistance ?? 20000
  );
  const enableCollisionDetectionRef = useRef<boolean>(
    screenSpaceCameraController?.enableCollisionDetection ?? true
  );

  // Home position ref
  const homeRef = useRef<CameraViewOptions | null>(
    config.initialCamera ?? (config.initialCameraLookAt as any) ?? null
  );

  // Use initialStyleId prop if provided, otherwise fall back to first style
  const initialStyle =
    initialStyleId ||
    (sceneStyle && sceneStyle.styles && sceneStyle.styles.length > 0
      ? sceneStyle.styles[0].id
      : undefined);
  const currentSceneStyleRef = useRef<string | undefined>(initialStyle);

  const dataSourcesRef = useRef<Record<string, any> | null>(null);

  // Cesium widget instance lifecycle history
  // Tracks each time a Cesium widget instance was created (3D mode activation)
  const [cesiumInstances, setCesiumInstances] = useState<
    CesiumInstanceRecord[]
  >([]);

  // Event bus for the Cesium context
  const { subscribe, emit } = useMemo(
    () => createEventBus<CesiumContextEventMap>(),
    []
  );

  // Listen for Activate event to trigger Cesium widget instance creation
  useContextSetupActivationListener(
    subscribe,
    setCesiumInstances,
    widgetRef,
    config
  );

  // MINIMAL MODE: Only essential subscriptions enabled
  useContextSetupSubscriptions({
    subscribe,
    emit,
    sceneRef,
    isSuspendedRef,
    tilesetsRef,
    imageryLayersRef,
    isAnimatingRef,
    minZoomDistanceRef,
    maxZoomDistanceRef,
    enableCollisionDetectionRef,
    currentSceneStyleRef,
    homeRef,
    sceneStyle,
    config,
  });

  // Apply initial scene style when scene is ready
  useContextSetupInitialStyle(subscribe, emit, initialStyle);

  // Track camera position changes and emit CameraChanged events
  useContextSetupCameraTracking(widgetRef, sceneRef, subscribe, emit);

  // ALL PROVIDER LOADERS DISABLED for minimal mode
  // useImageryProviderLoader({ providerConfig, imageryLayerRef, isValidViewer });
  // useImageryLayer({ isViewerReady, sceneRef, imageryLayerRef });
  // useTerrainProviderLoader({
  //   providerConfig,
  //   terrainProviderRef,
  // });
  // useSurfaceProviderLoader({
  //   providerConfig,
  //   surfaceProviderRef,
  // });
  // useModelsLoader({
  //   models,
  //   sceneRef,
  // });

  const requestRender = useCallback(() => {
    sceneRef.current && sceneRequestRender(sceneRef.current);
  }, [sceneRef]);

  const contextValue = useMemo<CesiumContextType>(
    () => ({
      widgetRef,
      sceneRef,
      lastCameraStateRef,
      terrainProvidersRef,
      imageryLayersRef,
      tilesetsRef,
      modelsRef,
      isSuspendedRef,
      homeRef,
      minZoomDistanceRef,
      maxZoomDistanceRef,
      enableCollisionDetectionRef,
      currentSceneStyleRef,
      subscribe,
      emit,
      isAnimatingRef,
      transitionStateRef,
      suspendSSCCRef,
      shouldSuspendPitchLimiterRef,
      shouldSuspendCameraLimitersRef,
      requestRender,
      animationMapRef,
      config,
      cesiumInstances,
    }),
    [subscribe, emit, requestRender, config, cesiumInstances]
  );

  // Auto-recovery from Cesium errors
  useContextSetupErrorRecovery(setRemountKey);

  console.debug("CesiumContextProvider Changed/Rendered");

  return (
    <CesiumContext.Provider value={contextValue} key={remountKey}>
      {children}
    </CesiumContext.Provider>
  );
};

export default CesiumContextProvider;
