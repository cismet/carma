import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { ReactNode } from "react";

import {
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Viewer,
  Cesium3DTileset,
} from "cesium";

import { handleDelayedRender } from "@carma-commons/utils/window";
import { useFeatureFlags } from "@carma-providers/feature-flag";

import { CesiumContext, type CesiumContextType } from "./CesiumContext";
import {
  loadCesiumImageryLayer,
  loadCesiumTerrainProvider,
  ProviderConfig,
} from "./utils/cesiumProviders";
import { loadTileset, TilesetConfigs } from "./utils/cesiumTilesetProviders";
import { useValidInstances } from "./hooks/useValidInstances";
import { guardScene } from "./utils/guardScene";

import {
  initViewerAnimationMap,
  ViewerAnimationMap,
} from "./utils/viewerAnimationMap";

const CALLSTACK_LIMIT = 50;

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
  const viewerAnimationMapRef = useRef<ViewerAnimationMap | null>(
    initViewerAnimationMap()
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

  const { isDeveloperMode } = useFeatureFlags();

  // Give lifetime of component
  const mountTimeRef = useRef<number>(Date.now());
  const callStackRef = useRef<string[]>([]);
  const pushCesiumCallstack = useCallback((frame: string) => {
    const elapsed = ((Date.now() - mountTimeRef.current) / 1000).toFixed(2);
    const currentTimeOfDay = new Date().toTimeString().split(" ")[0];
    callStackRef.current.push(`[${currentTimeOfDay}] [${elapsed}s] ${frame}`);
    if (callStackRef.current.length > CALLSTACK_LIMIT) {
      callStackRef.current.shift();
    }
  }, []);

  const {
    withViewer,
    isValidViewer,
    withImageryLayerRef,
    withTerrainProviderRef,
    withEllipsoidTerrainProviderRef,
    withTilesetRef,
  } = useValidInstances(viewerRef);

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
  }, [providerConfig.terrainProvider.url, isValidViewer, isViewerReady]);

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

  const contextValue = useMemo<CesiumContextType>(
    () => ({
      viewerRef,
      viewerAnimationMapRef,
      shouldSuspendPitchLimiterRef,
      shouldSuspendCameraLimitersRef,
      isViewerReady,
      setIsViewerReady,
      initialCameraSettled,
      setInitialCameraSettled,
      initialCameraEpoch,
      bumpInitialCameraEpoch: () => setInitialCameraEpoch((v) => v + 1),
      // NOTE: Workaround for CesiumGS/cesium#12543 — delay/repeat options exist
      // to schedule additional renders in requestRenderMode when needed. These
      // options should be deprecated once upstream behavior is improved.
      isValidViewer,
      requestRender: (opts) => {
        const renderOnce = () => {
          withViewer((viewer) => {
            guardScene(
              contextValue,
              viewer.scene,
              "ctx requestRender"
            ).requestRender();
          });
        };
        handleDelayedRender(renderOnce, opts);
      },
      withViewer,
      withCamera: (cb) => withViewer((viewer) => cb(viewer.camera, viewer)),
      withCanvas: (cb) => withViewer((viewer) => cb(viewer.canvas, viewer)),
      withScene: (cb) => withViewer((viewer) => cb(viewer.scene, viewer)),
      withEntities: (cb) => withViewer((viewer) => cb(viewer.entities, viewer)),
      withImageryLayer: (cb) =>
        withImageryLayerRef(imageryLayerRef, (imageryLayer, viewer) =>
          cb(imageryLayer, viewer)
        ),
      withPrimaryTileset: (cb) =>
        withTilesetRef(primaryTilesetRef, (tileset, viewer) =>
          cb(tileset, viewer)
        ),
      withSecondaryTileset: (cb) =>
        withTilesetRef(secondaryTilesetRef, (tileset, viewer) =>
          cb(tileset, viewer)
        ),
      withEllipsoidTerrainProvider: (cb) =>
        withEllipsoidTerrainProviderRef(
          ellipsoidTerrainProviderRef,
          (provider, viewer) => cb(provider, viewer)
        ),
      withTerrainProvider: (cb) =>
        withTerrainProviderRef(terrainProviderRef, (provider, viewer) =>
          cb(provider, viewer)
        ),
      withSurfaceProvider: (cb) =>
        withTerrainProviderRef(surfaceProviderRef, (provider, viewer) =>
          cb(provider, viewer)
        ),
      debug: isDeveloperMode,
      pushCesiumCallstack,
      callStackRef,
    }),
    [
      isDeveloperMode,
      isViewerReady,
      initialCameraSettled,
      initialCameraEpoch,
      isValidViewer,
      withViewer,
      withImageryLayerRef,
      withTerrainProviderRef,
      withEllipsoidTerrainProviderRef,
      withTilesetRef,
      pushCesiumCallstack,
    ]
  );

  console.debug(
    "[CESIUM|CONTEXT] CesiumContextProvider Changed/Rendered",
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
