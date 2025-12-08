import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Viewer } from "cesium";

import {
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Cesium3DTileset,
  Scene,
  isValidScene,
  isValidCesiumTerrainProvider,
  isValidImageryLayer,
} from "@carma/cesium";
import { handleDelayedRender } from "@carma-commons/utils/window";

import { CesiumContext, type CesiumContextType } from "./CesiumContext";

import { ProviderConfig } from "./utils/cesiumProviders";
import { loadTileset, TilesetConfigs } from "./utils/cesiumTilesetProviders";
import { useValidInstances } from "./hooks/useValidInstances";
import { usePreloadProviders } from "./hooks/usePreloadProviders";
import { guardScene } from "./utils/guardScene";

import {
  initSceneAnimationMap,
  SceneAnimationMap,
} from "./utils/sceneAnimationMap";

export const CesiumContextProvider = ({
  children,
  providerConfig,
  tilesetConfigs,
}: {
  children: ReactNode;
  providerConfig: ProviderConfig;
  tilesetConfigs: TilesetConfigs;
}) => {
  // Use refs for Cesium instances to prevent re-renders
  const viewerRef = useRef<Viewer | null>(null);
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
  const [isViewerReady, setIsViewerReady] = useState<boolean>(false);
  // Tri-state: null (not started), false (applying), true (settled)
  const [initialCameraSettled, setInitialCameraSettled] = useState<
    boolean | null
  >(null);
  // Monotonic counter for initial camera applications
  const [initialCameraEpoch, setInitialCameraEpoch] = useState<number>(0);

  const getScene = useCallback((): Scene | null => {
    if (viewerRef.current) {
      const scene = viewerRef.current.scene;
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

  // Pre-load all providers before viewer initialization
  const providersReady = usePreloadProviders(providerRefs, providerConfig);

  const instanceCallbacks = useValidInstances(
    viewerRef,
    imageryLayerRef,
    primaryTilesetRef,
    secondaryTilesetRef,
    terrainProviderRef,
    ellipsoidTerrainProviderRef,
    surfaceProviderRef
  );

  const { withViewer, isValidViewer } = instanceCallbacks;

  // Load Primary Tileset
  useEffect(() => {
    if (tilesetConfigs.primary && isViewerReady) {
      const fetchPrimary = async () => {
        console.debug(
          "[CESIUM|DEBUG] Loading primary tileset",
          tilesetConfigs.primary
        );
        primaryTilesetRef.current = await loadTileset(tilesetConfigs.primary);
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
      // Don't destroy providers when transitioning to 2D mode - only when viewer is destroyed
      const t = primaryTilesetRef.current;
      if (t && !t.isDestroyed() && isValidViewer()) {
        console.debug("[CESIUM|DEBUG] Destroying primary tileset");
        t.destroy();
        primaryTilesetRef.current = null;
      }
    };
  }, [tilesetConfigs.primary, isViewerReady, isValidViewer]);

  // Load Secondary Tileset
  useEffect(() => {
    if (tilesetConfigs.secondary && isViewerReady && isValidViewer()) {
      const fetchSecondary = async () => {
        console.debug(
          "[CESIUM|DEBUG] Loading secondary tileset",
          tilesetConfigs.secondary
        );
        secondaryTilesetRef.current = await loadTileset(
          tilesetConfigs.secondary!
        );
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
      // Don't destroy providers when transitioning to 2D mode - only when viewer is destroyed
      const t = secondaryTilesetRef.current;
      if (t && !t.isDestroyed() && isValidViewer()) {
        console.debug("[CESIUM|DEBUG] Destroying secondary tileset");
        t.destroy();
        secondaryTilesetRef.current = null;
      }
    };
  }, [tilesetConfigs.secondary, isViewerReady, isValidViewer]);

  const bumpInitialCameraEpoch = useCallback(
    () => setInitialCameraEpoch((v) => v + 1),
    [setInitialCameraEpoch]
  );
  const requestRender = useCallback(
    (opts) => {
      const renderOnce = () => {
        withViewer((viewer) => {
          guardScene(viewer.scene, "ctx requestRender").requestRender();
        });
      };
      handleDelayedRender(renderOnce, opts);
    },
    [withViewer]
  );

  console.debug(
    "CesiumContextProvider Rendered",
    isViewerReady,
    initialCameraEpoch,
    providersReady,
    isViewerReady
  );

  const contextValue = useMemo<CesiumContextType>(
    () => ({
      viewerRef,
      getScene,
      getTerrainProvider,
      getSurfaceProvider,
      getImageryLayer,
      sceneAnimationMapRef,
      shouldSuspendPitchLimiterRef,
      shouldSuspendCameraLimitersRef,
      setIsViewerReady,
      providersReady,
      initialCameraSettled,
      setInitialCameraSettled,
      initialCameraEpoch,
      bumpInitialCameraEpoch,
      isViewerReady,
      // NOTE: Workaround for CesiumGS/cesium#12543 — delay/repeat options exist
      // to schedule additional renders in requestRenderMode when needed. These
      // options should be deprecated once upstream behavior is improved.
      requestRender,
      ...instanceCallbacks,
    }),
    [
      getScene,
      getTerrainProvider,
      getSurfaceProvider,
      getImageryLayer,
      isViewerReady,
      providersReady,
      initialCameraSettled,
      initialCameraEpoch,
      bumpInitialCameraEpoch,
      requestRender,
      instanceCallbacks,
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
