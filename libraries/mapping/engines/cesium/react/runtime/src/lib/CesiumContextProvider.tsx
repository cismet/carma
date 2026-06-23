import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  CesiumWidget,
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Cesium3DTileset,
  Scene,
} from "@carma-cesium";
import {
  initSceneAnimationMap,
  isValidScene,
  isValidCesiumTerrainProvider,
  isValidImageryLayer,
  type SceneAnimationMap,
} from "@carma-mapping/engines/cesium/core";

import { handleDelayedRender } from "@carma-commons/dom/window";

import { CesiumContext, type CesiumContextType } from "./CesiumContext";
import { CESIUM_RUNTIME_TRANSITION_STATE } from "./runtime-transition-state";
import type { CesiumState, SceneStyles } from "./index.d";

import { ProviderConfig } from "./utils/cesiumProviders";
import { loadTileset, TilesetConfigs } from "./utils/cesiumTilesetProviders";
import { useValidInstances } from "./hooks/useValidInstances";
import { usePreloadProviders } from "./hooks/usePreloadProviders";
import { guardScene } from "./utils/guardScene";

export const CesiumContextProvider = ({
  children,
  providerConfig,
  tilesetConfigs,
  defaultRuntimeState,
}: {
  children: ReactNode;
  providerConfig: ProviderConfig;
  tilesetConfigs: TilesetConfigs;
  // Initial runtime UI state (was the redux `cesium` preloadedState / config).
  defaultRuntimeState?: Partial<CesiumState>;
}) => {
  // Use refs for Cesium instances to prevent re-renders
  const runtimeRef = useRef<CesiumWidget | null>(null);
  const sceneAnimationMapRef = useRef<SceneAnimationMap | null>(
    initSceneAnimationMap()
  );
  const ellipsoidTerrainProviderRef = useRef(new EllipsoidTerrainProvider());
  const terrainProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const surfaceProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const imageryLayerRef = useRef<ImageryLayer | null>(null);

  const primaryTilesetRef = useRef<Cesium3DTileset | null>(null);
  const secondaryTilesetRef = useRef<Cesium3DTileset | null>(null);
  const shouldSuspendPitchLimiterRef = useRef(false);
  const shouldSuspendCameraLimitersRef = useRef(false);

  // explicitly trigger re-renders
  const [isRuntimeReady, setIsRuntimeReady] = useState<boolean>(false);
  // Track when initial camera view from URL has been applied
  const [initialViewApplied, setInitialViewApplied] = useState<boolean>(false);

  // --- Runtime UI state (formerly the redux `cesium` slice) ---
  // Static, config-injected (do not change at runtime):
  const sceneStyles = defaultRuntimeState?.sceneStyles;
  const sceneStylePrimary = sceneStyles?.primary;
  const sceneStyleSecondary = sceneStyles?.secondary;
  const models = defaultRuntimeState?.models;

  // Low-frequency reactive fields (rare user/transition changes → plain state):
  const [currentTransition, setCurrentTransition] =
    useState<CESIUM_RUNTIME_TRANSITION_STATE>(
      CESIUM_RUNTIME_TRANSITION_STATE.NONE
    );
  const [currentSceneStyle, setCurrentSceneStyleState] = useState<
    keyof SceneStyles | undefined
  >(defaultRuntimeState?.currentSceneStyle);
  const [showPrimaryTileset, setShowPrimaryTilesetState] = useState<boolean>(
    defaultRuntimeState?.showPrimaryTileset ?? true
  );
  const [showSecondaryTileset, setShowSecondaryTilesetState] =
    useState<boolean>(defaultRuntimeState?.showSecondaryTileset ?? false);
  const [tilesetOpacity, setTilesetOpacityState] = useState<number>(
    defaultRuntimeState?.styling?.tileset?.opacity ?? 1.0
  );
  const [ssccMinimumZoomDistance, setSsccMinimumZoomDistanceState] =
    useState<number>(
      defaultRuntimeState?.sceneSpaceCameraController?.minimumZoomDistance ?? 1
    );
  const [ssccMaximumZoomDistance, setSsccMaximumZoomDistanceState] =
    useState<number>(
      defaultRuntimeState?.sceneSpaceCameraController?.maximumZoomDistance ??
        Infinity
    );
  const [ssccEnableCollisionDetection, setSsccEnableCollisionDetectionState] =
    useState<boolean>(
      defaultRuntimeState?.sceneSpaceCameraController
        ?.enableCollisionDetection ?? false
    );

  const isTransitioning =
    currentTransition !== CESIUM_RUNTIME_TRANSITION_STATE.NONE;

  // Camera animation flag — plain reactive state. Flips per-episode (limiter
  // flyTo / orbit toggle), not per-frame, so re-renders are negligible.
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  // Setters (stable identities)
  const setTransitionTo2d = useCallback(
    () => setCurrentTransition(CESIUM_RUNTIME_TRANSITION_STATE.TO2D),
    []
  );
  const setTransitionTo3d = useCallback(
    () => setCurrentTransition(CESIUM_RUNTIME_TRANSITION_STATE.TO3D),
    []
  );
  const clearTransition = useCallback(
    () => setCurrentTransition(CESIUM_RUNTIME_TRANSITION_STATE.NONE),
    []
  );
  const setCurrentSceneStyle = useCallback(
    (style: keyof SceneStyles) => setCurrentSceneStyleState(style),
    []
  );
  const toggleCurrentSceneStyle = useCallback(
    () =>
      setCurrentSceneStyleState((current) =>
        current === "primary" ? "secondary" : "primary"
      ),
    []
  );
  const setShowPrimaryTileset = useCallback(
    (show: boolean) => setShowPrimaryTilesetState(show),
    []
  );
  const setShowSecondaryTileset = useCallback(
    (show: boolean) => setShowSecondaryTilesetState(show),
    []
  );
  const setTilesetOpacity = useCallback(
    (opacity: number) => setTilesetOpacityState(opacity),
    []
  );
  const setSsccMinimumZoomDistance = useCallback(
    (distance: number) => setSsccMinimumZoomDistanceState(distance),
    []
  );
  const setSsccMaximumZoomDistance = useCallback(
    (distance: number) => setSsccMaximumZoomDistanceState(distance),
    []
  );
  const setSsccEnableCollisionDetection = useCallback(
    (enabled: boolean) => setSsccEnableCollisionDetectionState(enabled),
    []
  );

  const getScene = useCallback((): Scene | null => {
    if (runtimeRef.current && !runtimeRef.current.isDestroyed()) {
      const scene = runtimeRef.current.scene;
      if (isValidScene(scene)) {
        return scene;
      }
    }
    return null;
  }, []);

  const getTerrainProvider = useCallback((): CesiumTerrainProvider | null => {
    const provider = terrainProviderRef.current;
    if (isValidCesiumTerrainProvider(provider)) {
      return provider;
    }
    return null;
  }, []);

  const getSurfaceProvider = useCallback((): CesiumTerrainProvider | null => {
    const provider = surfaceProviderRef.current;
    if (isValidCesiumTerrainProvider(provider)) {
      return provider;
    }
    return null;
  }, []);

  const getImageryLayer = useCallback((): ImageryLayer | null => {
    const layer = imageryLayerRef.current;
    if (isValidImageryLayer(layer)) {
      return layer;
    }
    return null;
  }, []);

  // Memoize refs object to prevent recreation on every render
  const providerRefs = useMemo(
    () => ({
      terrainProviderRef,
      surfaceProviderRef,
      imageryLayerRef,
    }),
    [terrainProviderRef, surfaceProviderRef, imageryLayerRef]
  );

  // Pre-load all providers before widget initialization
  const providersReady = usePreloadProviders(providerRefs, providerConfig);

  const instanceCallbacks = useValidInstances(
    runtimeRef,
    imageryLayerRef,
    primaryTilesetRef,
    secondaryTilesetRef,
    terrainProviderRef,
    ellipsoidTerrainProviderRef,
    surfaceProviderRef
  );

  const { withScene, isValidRuntime } = instanceCallbacks;

  // Load Primary Tileset
  useEffect(() => {
    let cancelled = false;
    if (tilesetConfigs.primary && isRuntimeReady) {
      const fetchPrimary = async () => {
        console.debug(
          "[CESIUM|DEBUG] Loading primary tileset",
          tilesetConfigs.primary
        );
        const tileset = await loadTileset(tilesetConfigs.primary);
        if (cancelled) {
          if (!tileset.isDestroyed()) {
            tileset.destroy();
          }
          return;
        }
        primaryTilesetRef.current = tileset;
        console.debug(
          "[CESIUM|DEBUG] Loaded primary tileset",
          primaryTilesetRef.current
        );
      };
      fetchPrimary().catch(console.error);
    } else {
      console.debug("[CESIUM|DEBUG] No primary tileset configured");
    }

    return () => {
      cancelled = true;
      // Don't destroy providers when transitioning to 2D mode - only when runtime is destroyed
      const t = primaryTilesetRef.current;
      if (t && !t.isDestroyed() && isValidRuntime()) {
        console.debug("[CESIUM|DEBUG] Destroying primary tileset");
        t.destroy();
        primaryTilesetRef.current = null;
      }
    };
  }, [tilesetConfigs.primary, isRuntimeReady, isValidRuntime]);

  // Load Secondary Tileset
  useEffect(() => {
    let cancelled = false;
    if (tilesetConfigs.secondary && isRuntimeReady && isValidRuntime()) {
      const fetchSecondary = async () => {
        console.debug(
          "[CESIUM|DEBUG] Loading secondary tileset",
          tilesetConfigs.secondary
        );
        const tileset = await loadTileset(tilesetConfigs.secondary!);
        if (cancelled) {
          if (!tileset.isDestroyed()) {
            tileset.destroy();
          }
          return;
        }
        secondaryTilesetRef.current = tileset;
        console.debug(
          "[CESIUM|DEBUG] Loaded secondary tileset",
          secondaryTilesetRef.current
        );
      };
      fetchSecondary().catch(console.error);
    } else {
      console.debug("[CESIUM|DEBUG] No secondary tileset configured");
    }

    return () => {
      cancelled = true;
      // Don't destroy providers when transitioning to 2D mode - only when runtime is destroyed
      const t = secondaryTilesetRef.current;
      if (t && !t.isDestroyed() && isValidRuntime()) {
        console.debug("[CESIUM|DEBUG] Destroying secondary tileset");
        t.destroy();
        secondaryTilesetRef.current = null;
      }
    };
  }, [tilesetConfigs.secondary, isRuntimeReady, isValidRuntime]);

  const requestRender = useCallback(
    (opts) => {
      const renderOnce = () => {
        withScene((scene) => {
          guardScene(scene, "ctx requestRender").requestRender();
        });
      };
      handleDelayedRender(renderOnce, opts);
    },
    [withScene]
  );

  const contextValue = useMemo<CesiumContextType>(
    () => ({
      runtimeRef,
      getScene,
      getTerrainProvider,
      getSurfaceProvider,
      getImageryLayer,
      sceneAnimationMapRef,
      shouldSuspendPitchLimiterRef,
      shouldSuspendCameraLimitersRef,
      setIsRuntimeReady,
      setInitialViewApplied,
      providersReady,
      initialViewApplied,
      isRuntimeReady,
      // NOTE: Workaround for CesiumGS/cesium#12543 — delay/repeat options exist
      // to schedule additional renders in requestRenderMode when needed. These
      // options should be deprecated once upstream behavior is improved.
      requestRender,
      // runtime UI state (formerly the cesium redux slice)
      currentTransition,
      isTransitioning,
      setTransitionTo2d,
      setTransitionTo3d,
      clearTransition,
      sceneStyles,
      sceneStylePrimary,
      sceneStyleSecondary,
      currentSceneStyle,
      setCurrentSceneStyle,
      toggleCurrentSceneStyle,
      models,
      showPrimaryTileset,
      showSecondaryTileset,
      setShowPrimaryTileset,
      setShowSecondaryTileset,
      tilesetOpacity,
      setTilesetOpacity,
      ssccMinimumZoomDistance,
      ssccMaximumZoomDistance,
      ssccEnableCollisionDetection,
      setSsccMinimumZoomDistance,
      setSsccMaximumZoomDistance,
      setSsccEnableCollisionDetection,
      isAnimating,
      setIsAnimating,
      ...instanceCallbacks,
    }),
    [
      getScene,
      getTerrainProvider,
      getSurfaceProvider,
      getImageryLayer,
      isRuntimeReady,
      initialViewApplied,
      providersReady,
      requestRender,
      currentTransition,
      isTransitioning,
      setTransitionTo2d,
      setTransitionTo3d,
      clearTransition,
      sceneStyles,
      sceneStylePrimary,
      sceneStyleSecondary,
      currentSceneStyle,
      setCurrentSceneStyle,
      toggleCurrentSceneStyle,
      models,
      showPrimaryTileset,
      showSecondaryTileset,
      setShowPrimaryTileset,
      setShowSecondaryTileset,
      tilesetOpacity,
      setTilesetOpacity,
      ssccMinimumZoomDistance,
      ssccMaximumZoomDistance,
      ssccEnableCollisionDetection,
      setSsccMinimumZoomDistance,
      setSsccMaximumZoomDistance,
      setSsccEnableCollisionDetection,
      isAnimating,
      setIsAnimating,
      instanceCallbacks,
    ]
  );

  return (
    <CesiumContext.Provider value={contextValue}>
      {children}
    </CesiumContext.Provider>
  );
};

export default CesiumContextProvider;
