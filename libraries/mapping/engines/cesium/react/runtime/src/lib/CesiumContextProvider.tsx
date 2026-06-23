import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  CesiumWidget,
  CesiumTerrainProvider,
  ImageryLayer,
  Cesium3DTileset,
  Scene,
} from "@carma-cesium";
import {
  initSceneAnimationMap,
  isValidScene,
  type SceneAnimationMap,
} from "@carma-mapping/engines/cesium/core";

import { handleDelayedRender } from "@carma-commons/dom/window";

import { CesiumContext, type CesiumContextType } from "./CesiumContext";
import { CESIUM_RUNTIME_TRANSITION_STATE } from "./runtime-transition-state";
import type { CesiumState, SceneStyleId, SceneStyles } from "./index.d";

import {
  DEFAULT_SURFACE_PROVIDER_ID,
  DEFAULT_TERRAIN_PROVIDER_ID,
  getTerrainProviderInitSignature,
  normalizeTerrainProviderConfigs,
  type ProviderConfig,
} from "./utils/cesiumProviders";
import {
  getTilesetInitSignature,
  loadTileset,
  TilesetConfigs,
} from "./utils/cesiumTilesetProviders";
import { useValidInstances } from "./hooks/useValidInstances";
import { usePreloadProviders } from "./hooks/usePreloadProviders";

const EMPTY_SCENE_STYLES: SceneStyles = {};

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
  const terrainProviderRefsByIdRef = useRef<
    Record<string, CesiumTerrainProvider | null | undefined>
  >({});
  const imageryLayerRefsByIdRef = useRef<
    Record<string, ImageryLayer | null | undefined>
  >({});

  const tilesetRefsByIdRef = useRef<
    Record<string, Cesium3DTileset | null | undefined>
  >({});
  const tilesetLoadedInitSignaturesByIdRef = useRef<
    Record<string, string | undefined>
  >({});
  const shouldSuspendPitchLimiterRef = useRef(false);
  const shouldSuspendCameraLimitersRef = useRef(false);

  // explicitly trigger re-renders
  const [isRuntimeReady, setIsRuntimeReady] = useState<boolean>(false);
  // Track when initial camera view from URL has been applied
  const [initialViewApplied, setInitialViewApplied] = useState<boolean>(false);

  // --- Runtime UI state (formerly the redux `cesium` slice) ---
  // Static, config-injected (do not change at runtime):
  const sceneStyles = defaultRuntimeState?.sceneStyles ?? EMPTY_SCENE_STYLES;
  const sceneStyleIds = useMemo(() => Object.keys(sceneStyles), [sceneStyles]);
  const tilesetIds = useMemo(
    () => Object.keys(tilesetConfigs),
    [tilesetConfigs]
  );
  const terrainProviderInitSignaturesById = useMemo(() => {
    const terrainProviderConfigs =
      normalizeTerrainProviderConfigs(providerConfig);
    return Object.fromEntries(
      Object.entries(terrainProviderConfigs).map(([id, config]) => [
        id,
        getTerrainProviderInitSignature(config),
      ])
    );
  }, [providerConfig]);
  const tilesetInitSignaturesById = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(tilesetConfigs).map(([id, config]) => [
          id,
          getTilesetInitSignature(config),
        ])
      ),
    [tilesetConfigs]
  );
  const models = defaultRuntimeState?.models;

  // Low-frequency reactive fields (rare user/transition changes → plain state):
  const [currentTransition, setCurrentTransition] =
    useState<CESIUM_RUNTIME_TRANSITION_STATE>(
      CESIUM_RUNTIME_TRANSITION_STATE.NONE
    );
  const [currentSceneStyle, setCurrentSceneStyleState] = useState<
    SceneStyleId | undefined
  >(
    defaultRuntimeState?.currentSceneStyle ?? sceneStyleIds[0] ?? tilesetIds[0]
  );
  const currentSceneStyleConfig =
    currentSceneStyle !== undefined
      ? sceneStyles[currentSceneStyle]
      : undefined;
  const currentTerrainProviderId =
    currentSceneStyleConfig?.members?.terrainProviderId ??
    DEFAULT_TERRAIN_PROVIDER_ID;
  const currentSurfaceProviderId =
    currentSceneStyleConfig?.members?.surfaceProviderId ??
    DEFAULT_SURFACE_PROVIDER_ID;
  const visibleTilesetIds = useMemo(
    () => currentSceneStyleConfig?.members?.tilesets?.map(({ id }) => id) ?? [],
    [currentSceneStyleConfig]
  );
  const getTerrainProviderInitSignatureById = useCallback(
    (id: string) => terrainProviderInitSignaturesById[id],
    [terrainProviderInitSignaturesById]
  );
  const getTilesetInitSignatureById = useCallback(
    (id: string) => tilesetInitSignaturesById[id],
    [tilesetInitSignaturesById]
  );
  // Read-only screen-space-camera-controller bounds (config, never mutated).
  const sscc = defaultRuntimeState?.sceneSpaceCameraController;
  const ssccMinimumZoomDistance = sscc?.minimumZoomDistance ?? 1;
  const ssccMaximumZoomDistance = sscc?.maximumZoomDistance ?? Infinity;
  const ssccEnableCollisionDetection = sscc?.enableCollisionDetection ?? false;

  const isTransitioning =
    currentTransition !== CESIUM_RUNTIME_TRANSITION_STATE.NONE;

  // Camera animation flag — plain reactive state. Flips per-episode (limiter
  // flyTo / orbit toggle), not per-frame, so re-renders are negligible.
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  // Setters (stable identities)
  const clearTransition = useCallback(
    () => setCurrentTransition(CESIUM_RUNTIME_TRANSITION_STATE.NONE),
    []
  );
  const setCurrentSceneStyle = useCallback(
    (style: SceneStyleId) => setCurrentSceneStyleState(style),
    []
  );
  const toggleCurrentSceneStyle = useCallback(
    () =>
      setCurrentSceneStyleState((current) => {
        if (sceneStyleIds.length === 0) {
          return current;
        }

        const index = current ? sceneStyleIds.indexOf(current) : -1;
        return sceneStyleIds[(index + 1) % sceneStyleIds.length];
      }),
    [sceneStyleIds]
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

  // Memoize refs object to prevent recreation on every render
  const providerRefs = useMemo(
    () => ({
      terrainProviderRefsByIdRef,
      imageryLayerRefsByIdRef,
    }),
    [terrainProviderRefsByIdRef, imageryLayerRefsByIdRef]
  );

  // Pre-load all providers before widget initialization
  const providersReady = usePreloadProviders(providerRefs, providerConfig);

  const instanceCallbacks = useValidInstances(
    runtimeRef,
    imageryLayerRefsByIdRef,
    tilesetRefsByIdRef,
    terrainProviderRefsByIdRef,
    currentTerrainProviderId,
    currentSurfaceProviderId
  );

  const {
    withScene,
    isValidRuntime,
    getTerrainProvider,
    getSurfaceProvider,
    getImageryLayer,
  } = instanceCallbacks;

  // Load configured scene-member tilesets.
  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(tilesetConfigs);

    if (!isRuntimeReady || !isValidRuntime() || entries.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    const destroyLoadedTileset = (id: string, tileset: Cesium3DTileset) => {
      const scene = getScene();
      if (scene?.primitives.contains(tileset)) {
        scene.primitives.remove(tileset);
        scene.requestRender();
      } else if (!tileset.isDestroyed()) {
        tileset.destroy();
      }
      tilesetRefsByIdRef.current[id] = undefined;
      tilesetLoadedInitSignaturesByIdRef.current[id] = undefined;
    };

    for (const [id, config] of entries) {
      const initSignature = tilesetInitSignaturesById[id];
      const loadedTileset = tilesetRefsByIdRef.current[id];
      const loadedInitSignature =
        tilesetLoadedInitSignaturesByIdRef.current[id];

      if (loadedTileset && loadedInitSignature === initSignature) {
        continue;
      }

      if (loadedTileset && !loadedTileset.isDestroyed()) {
        console.debug("[CESIUM|DEBUG] Replacing tileset", id);
        destroyLoadedTileset(id, loadedTileset);
      }

      const loadConfiguredTileset = async () => {
        console.debug("[CESIUM|DEBUG] Loading tileset", id, config);
        const tileset = await loadTileset(config);
        if (cancelled) {
          if (!tileset.isDestroyed()) {
            tileset.destroy();
          }
          return;
        }

        tilesetRefsByIdRef.current[id] = tileset;
        tilesetLoadedInitSignaturesByIdRef.current[id] = initSignature;
        console.debug("[CESIUM|DEBUG] Loaded tileset", id, tileset);
      };

      loadConfiguredTileset().catch(console.error);
    }

    return () => {
      cancelled = true;
      if (!isValidRuntime()) {
        for (const [id, tileset] of Object.entries(
          tilesetRefsByIdRef.current
        )) {
          if (tileset && !tileset.isDestroyed()) {
            console.debug("[CESIUM|DEBUG] Destroying tileset", id);
            tileset.destroy();
          }
        }
        tilesetRefsByIdRef.current = {};
        tilesetLoadedInitSignaturesByIdRef.current = {};
      }
    };
  }, [
    getScene,
    tilesetConfigs,
    tilesetInitSignaturesById,
    isRuntimeReady,
    isValidRuntime,
  ]);

  const requestRender = useCallback(
    (opts) => {
      const renderOnce = () => {
        withScene((scene) => {
          scene.requestRender();
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
      getTerrainProviderInitSignatureById,
      getTilesetInitSignatureById,
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
      clearTransition,
      sceneStyles,
      sceneStyleIds,
      currentSceneStyle,
      currentSceneStyleConfig,
      setCurrentSceneStyle,
      toggleCurrentSceneStyle,
      models,
      tilesetIds,
      visibleTilesetIds,
      ssccMinimumZoomDistance,
      ssccMaximumZoomDistance,
      ssccEnableCollisionDetection,
      isAnimating,
      setIsAnimating,
      ...instanceCallbacks,
    }),
    [
      getScene,
      getTerrainProvider,
      getSurfaceProvider,
      getImageryLayer,
      getTerrainProviderInitSignatureById,
      getTilesetInitSignatureById,
      isRuntimeReady,
      initialViewApplied,
      providersReady,
      requestRender,
      currentTransition,
      isTransitioning,
      clearTransition,
      sceneStyles,
      sceneStyleIds,
      currentSceneStyle,
      currentSceneStyleConfig,
      setCurrentSceneStyle,
      toggleCurrentSceneStyle,
      models,
      tilesetIds,
      visibleTilesetIds,
      ssccMinimumZoomDistance,
      ssccMaximumZoomDistance,
      ssccEnableCollisionDetection,
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
