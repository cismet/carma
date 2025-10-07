import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Viewer,
  Cesium3DTileset,
  Scene,
} from "cesium";
import { createEventBus } from "@carma-commons/utils";

import { CesiumContext, type CesiumContextType } from "./CesiumContext";
import type { CesiumContextEventMap } from "./cesiumContextEventMap";

import {
  loadCesiumImageryLayer,
  loadCesiumTerrainProvider,
  ProviderConfig,
} from "./utils/cesiumProviders";
import { loadTileset, TilesetConfigs } from "./utils/cesiumTilesetProviders";
import { useValidInstances } from "./hooks/useValidInstances";

import { initAnimationMap, AnimationMap } from "./utils/animationMap";
import { sceneRequestRender } from "./utils/sceneRequestRender";

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

  // explicitly trigger re-renders
  const [isViewerReady, setIsViewerReady] = useState<boolean>(false);
  // Tri-state: null (not started), false (applying), true (settled)
  const [initialCameraSettled, setInitialCameraSettled] = useState<
    boolean | null
  >(null);
  // Monotonic counter for initial camera applications
  const [initialCameraEpoch, setInitialCameraEpoch] = useState<number>(0);

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

  const { isValidViewer } = instanceCallbacks;

  // Asynchronous initialization of providers and imageryLayer
  useEffect(() => {
    if (providerConfig.imageryProvider) {
      const abortController = new AbortController();
      const { signal } = abortController;

      // ImageryLayer initialization
      loadCesiumImageryLayer(
        imageryLayerRef,
        providerConfig.imageryProvider,
        signal
      );

      return () => {
        // Only abort if viewer is being destroyed, not during 2D/3D transitions
        !isValidViewer() && abortController.abort();
      };
    } else {
      console.info("[CESIUM|CONTEXT] No imagery provider configured");
    }
  }, [providerConfig.imageryProvider, isValidViewer]);

  useEffect(() => {
    if (!isViewerReady) {
      return;
    } // avoids runtime issues with WebGL context not available

    const abortController = new AbortController();
    const { signal } = abortController;

    loadCesiumTerrainProvider(
      terrainProviderRef,
      providerConfig.terrainProvider.url,
      signal
    );

    return () => {
      !isValidViewer() && abortController.abort();
    };
  }, [providerConfig.terrainProvider.url, isViewerReady, isValidViewer]);

  useEffect(() => {
    if (!isViewerReady) {
      return;
    } // avoids runtime issues with WebGL context not available

    if (providerConfig.surfaceProvider) {
      const abortController = new AbortController();
      const { signal } = abortController;

      loadCesiumTerrainProvider(
        surfaceProviderRef,
        providerConfig.surfaceProvider.url,
        signal
      );

      return () => {
        !isValidViewer() && abortController.abort();
      };
    }
  }, [providerConfig.surfaceProvider, isViewerReady, isValidViewer]);

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
      if (t && !t.isDestroyed() && !isValidViewer()) {
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
      if (t && !t.isDestroyed() && !isValidViewer()) {
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

  const requestRender = useCallback(() => {
    sceneRef.current && sceneRequestRender(sceneRef.current);
  }, [sceneRef]);

  const contextValue = useMemo<CesiumContextType>(
    () => ({
      viewerRef,
      sceneRef,
      animationMapRef,
      shouldSuspendPitchLimiterRef,
      shouldSuspendCameraLimitersRef,
      setIsViewerReady,
      initialCameraSettled,
      setInitialCameraSettled,
      initialCameraEpoch,
      bumpInitialCameraEpoch,
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
