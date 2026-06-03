import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
// legacy type, prefer using scene, graphic primitives and CesiumWidget where possible
// eslint-disable-next-line carma/no-direct-cesium
import type { Viewer } from "cesium";
import {
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

import { ProviderConfig } from "./utils/cesiumProviders";
import { loadTileset, TilesetConfigs } from "./utils/cesiumTilesetProviders";
import { useValidInstances } from "./hooks/useValidInstances";
import { usePreloadProviders } from "./hooks/usePreloadProviders";
import { guardScene } from "./utils/guardScene";

export const CesiumContextProvider = ({
  children,
  providerConfig,
  tilesetConfigs,
}: {
  children: ReactNode;
  providerConfig: ProviderConfig;
  tilesetConfigs: TilesetConfigs;
}) => {
  const primaryTilesetConfigured = Boolean(tilesetConfigs.primary);
  const secondaryTilesetConfigured = Boolean(tilesetConfigs.secondary);

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
  // Track when initial camera view from URL has been applied
  const [initialViewApplied, setInitialViewApplied] = useState<boolean>(false);
  const [primaryTilesetReady, setPrimaryTilesetReady] = useState<boolean>(
    !primaryTilesetConfigured
  );
  const [secondaryTilesetReady, setSecondaryTilesetReady] = useState<boolean>(
    !secondaryTilesetConfigured
  );
  const tilesetsReady = primaryTilesetReady && secondaryTilesetReady;

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
    if (!tilesetConfigs.primary) {
      setPrimaryTilesetReady(true);
      console.debug("[CESIUM|DEBUG] No primary tileset configured");
      return;
    }
    if (!isViewerReady) {
      setPrimaryTilesetReady(false);
      return;
    }

    let cancelled = false;
    const tilesetConfig = tilesetConfigs.primary;
    setPrimaryTilesetReady(false);
    const fetchPrimary = async () => {
      console.debug("[CESIUM|DEBUG] Loading primary tileset", tilesetConfig);
      const tileset = await loadTileset(tilesetConfig);
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
    fetchPrimary().catch((error) => {
      console.error(error);
      if (!cancelled) {
        setPrimaryTilesetReady(false);
      }
    });

    return () => {
      cancelled = true;
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
    if (!tilesetConfigs.secondary) {
      setSecondaryTilesetReady(true);
      console.debug("[CESIUM|DEBUG] No secondary tileset configured");
      return;
    }
    if (!isViewerReady || !isValidViewer()) {
      setSecondaryTilesetReady(false);
      return;
    }

    let cancelled = false;
    const tilesetConfig = tilesetConfigs.secondary;
    setSecondaryTilesetReady(false);
    const fetchSecondary = async () => {
      console.debug("[CESIUM|DEBUG] Loading secondary tileset", tilesetConfig);
      const tileset = await loadTileset(tilesetConfig);
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
    fetchSecondary().catch((error) => {
      console.error(error);
      if (!cancelled) {
        setSecondaryTilesetReady(false);
      }
    });

    return () => {
      cancelled = true;
      // Don't destroy providers when transitioning to 2D mode - only when viewer is destroyed
      const t = secondaryTilesetRef.current;
      if (t && !t.isDestroyed() && isValidViewer()) {
        console.debug("[CESIUM|DEBUG] Destroying secondary tileset");
        t.destroy();
        secondaryTilesetRef.current = null;
      }
    };
  }, [tilesetConfigs.secondary, isViewerReady, isValidViewer]);

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
      setInitialViewApplied,
      providersReady,
      primaryTilesetConfigured,
      secondaryTilesetConfigured,
      tilesetsReady,
      setPrimaryTilesetReady,
      setSecondaryTilesetReady,
      initialViewApplied,
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
      initialViewApplied,
      providersReady,
      primaryTilesetConfigured,
      secondaryTilesetConfigured,
      tilesetsReady,
      requestRender,
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
