import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Viewer,
  Cesium3DTileset,
  Scene,
} from "cesium";
import { createEventBus } from "@carma-providers/event-bus";

import { CesiumContext, type CesiumContextType } from "./CesiumContext";
import type { CesiumContextEventMap } from "../../cesiumContextEventMap";

import { useValidInstances } from "../../hooks/useValidInstances";
import { useCesiumContextSubscriptions } from "./hooks/useCesiumContextSubscriptions";
import {
  useImageryProviderLoader,
  useImageryLayer,
  useTerrainProviderLoader,
  useSurfaceProviderLoader,
  usePrimaryTilesetLoader,
  useSecondaryTilesetLoader,
  useModelsLoader,
} from "./hooks/useCesiumProviderLoaders";

import type { ProviderConfig } from "../../utils/cesiumProviders";
import type { TilesetConfigs } from "../../utils/cesiumTilesetProviders";
import type { CesiumConfig, SceneStyles } from "../../../index";

import { initAnimationMap, AnimationMap } from "../../utils/animationMap";
import { sceneRequestRender } from "../../utils/sceneRequestRender";
import { TILESET_IDS, SCENE_STYLES } from "../../constants";

export const CesiumContextProvider = ({
  children,
  config,
}: {
  children: ReactNode;
  config: CesiumConfig;
}) => {
  const {
    providerConfig,
    tilesetConfigs,
    models,
    modelAssets,
    tilesetVisibility,
    tilesetOpacity,
    homePosition,
    homeOffset,
    cameraController,
    sceneStyles,
  } = config;
  // Use refs for Cesium instances to prevent re-renders
  const viewerRef = useRef<Viewer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const animationMapRef = useRef<AnimationMap | null>(initAnimationMap());
  const ellipsoidTerrainProviderRef = useRef(new EllipsoidTerrainProvider());
  const terrainProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const surfaceProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const imageryLayerRef = useRef<ImageryLayer | null>(null);

  const primaryTilesetRef = useRef<Cesium3DTileset | null>(null);
  const secondaryTilesetRef = useRef<Cesium3DTileset | null>(null);
  const shouldSuspendPitchLimiterRef = useRef(false);
  const shouldSuspendCameraLimitersRef = useRef(false);
  const isSuspendedRef = useRef(true); // Start suspended (in 2D mode)
  const isAnimatingRef = useRef(false);
  const suspendSSCCRef = useRef(false);

  // Camera controller settings from config
  const minZoomDistanceRef = useRef(cameraController?.minimumZoomDistance ?? 1);
  const maxZoomDistanceRef = useRef(
    cameraController?.maximumZoomDistance ?? Infinity
  );
  const enableCollisionDetectionRef = useRef(
    cameraController?.enableCollisionDetection ?? false
  );

  // Scene style settings - initialize to secondary if primary (LOD2) is visible
  const initialStyle =
    tilesetVisibility?.primary !== false
      ? SCENE_STYLES.SECONDARY
      : SCENE_STYLES.PRIMARY;
  const currentSceneStyleRef = useRef<string | undefined>(initialStyle);

  // Tileset visibility and styling
  const tilesetVisibilityRef = useRef<Map<string, boolean>>(
    new Map([
      [TILESET_IDS.PRIMARY, tilesetVisibility?.primary ?? true],
      [TILESET_IDS.SECONDARY, tilesetVisibility?.secondary ?? false],
    ])
  );
  const tilesetOpacityRef = useRef<Map<string, number>>(
    new Map([
      [TILESET_IDS.PRIMARY, tilesetOpacity?.primary ?? 1.0],
      [TILESET_IDS.SECONDARY, tilesetOpacity?.secondary ?? 1.0],
    ])
  );

  // Home position from config
  const homePositionRef = useRef<{ x: number; y: number; z: number } | null>(
    homePosition ?? null
  );
  const homeOffsetRef = useRef<{ x: number; y: number; z: number } | null>(
    homeOffset ?? null
  );

  const dataSourcesRef = useRef<Record<string, any> | null>(null);
  const modelsRef = useRef(modelAssets ?? null);

  // explicitly trigger re-renders
  const [isViewerReady, setIsViewerReady] = useState<boolean>(false);
  // Tri-state: null (not started), false (applying), true (settled)
  const [initialCameraSettled, setInitialCameraSettled] = useState<
    boolean | null
  >(null);

  // Monotonic counter for initial camera applications
  const [initialCameraEpoch, setInitialCameraEpoch] = useState<number>(0);

  // DEPRECATED: Transition state is now managed by TransitionContextProvider
  // Keeping these refs for backward compatibility, but they should not be used
  // Use useTransitionContext() instead in new code
  const transitionStateRef = useRef<string>("uninitialized");
  const transitionLifecycleRef = useRef<
    Record<string, () => void | Promise<void>>
  >({});

  // Event bus for the Cesium context
  const { subscribe, emit } = useMemo(
    () => createEventBus<CesiumContextEventMap>(),
    []
  );

  const instanceCallbacks = useValidInstances(
    viewerRef,
    sceneRef,
    imageryLayerRef,
    primaryTilesetRef,
    secondaryTilesetRef,
    terrainProviderRef,
    ellipsoidTerrainProviderRef,
    surfaceProviderRef
  );

  const { isValidViewer, withTerrainProvider } = instanceCallbacks;

  // Consolidated event subscriptions for all context refs
  useCesiumContextSubscriptions({
    subscribe,
    emit,
    sceneRef,
    isSuspendedRef,
    isAnimatingRef,
    minZoomDistanceRef,
    maxZoomDistanceRef,
    enableCollisionDetectionRef,
    currentSceneStyleRef,
    tilesetVisibilityRef,
    tilesetOpacityRef,
    homePositionRef,
    homeOffsetRef,
    withTerrainProvider,
    sceneStyles,
  });

  // Load all providers and tilesets using named hooks
  useImageryProviderLoader({ providerConfig, imageryLayerRef, isValidViewer });
  useImageryLayer({ isViewerReady, sceneRef, imageryLayerRef });
  useTerrainProviderLoader({
    providerConfig,
    terrainProviderRef,
    isViewerReady,
    isValidViewer,
  });
  useSurfaceProviderLoader({
    providerConfig,
    surfaceProviderRef,
    isViewerReady,
    isValidViewer,
  });
  usePrimaryTilesetLoader({
    tilesetConfigs,
    primaryTilesetRef,
    isViewerReady,
    isValidViewer,
  });
  useSecondaryTilesetLoader({
    tilesetConfigs,
    secondaryTilesetRef,
    isViewerReady,
    isValidViewer,
  });
  useModelsLoader({
    models,
    sceneRef,
    isViewerReady,
  });

  const bumpInitialCameraEpoch = useCallback(
    () => setInitialCameraEpoch((v) => v + 1),
    [setInitialCameraEpoch]
  );

  const requestRender = useCallback(() => {
    sceneRef.current && sceneRequestRender(sceneRef.current);
  }, [sceneRef]);

  const contextValue = useMemo<CesiumContextType>(
    () => ({
      viewerRef,
      sceneRef,
      terrainProviderRef,
      surfaceProviderRef,
      animationMapRef,
      primaryTilesetRef,
      secondaryTilesetRef,
      shouldSuspendPitchLimiterRef,
      shouldSuspendCameraLimitersRef,
      isSuspendedRef,
      isAnimatingRef,
      suspendSSCCRef,
      minZoomDistanceRef,
      maxZoomDistanceRef,
      enableCollisionDetectionRef,
      currentSceneStyleRef,
      tilesetVisibilityRef,
      tilesetOpacityRef,
      homePositionRef,
      homeOffsetRef,
      dataSources: dataSourcesRef,
      models: modelsRef,
      setIsViewerReady,
      initialCameraSettled,
      setInitialCameraSettled,
      transitionStateRef,
      transitionLifecycleRef,
      initialCameraEpoch,
      setInitialCameraEpoch,
      subscribe,
      emit,
      isViewerReady,
      // NOTE: Workaround for CesiumGS/cesium#12543 — delay/repeat options exist
      // to schedule additional renders in requestRenderMode when needed. These
      // options should be deprecated once upstream behavior is improved.
      requestRender,
      ...instanceCallbacks,
    }),
    [
      isViewerReady,
      initialCameraSettled,
      initialCameraEpoch,
      bumpInitialCameraEpoch,
      requestRender,
      instanceCallbacks,
      subscribe,
      emit,
      transitionStateRef,
      transitionLifecycleRef,
      modelsRef,
      dataSourcesRef,
    ]
  );

  console.debug(
    "CesiumContextProvider Changed/Rendered",
    isViewerReady,
    contextValue
  );

  return (
    <CesiumContext.Provider value={contextValue}>
      {children}
    </CesiumContext.Provider>
  );
};

export default CesiumContextProvider;
