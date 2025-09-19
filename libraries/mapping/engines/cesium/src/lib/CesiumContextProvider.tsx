import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  CesiumTerrainProvider,
  type CesiumWidget,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Cesium3DTileset,
} from "cesium";

import { handleDelayedRender } from "@carma-commons/utils/window";

import { CesiumContext, type CesiumContextType } from "./CesiumContext";
import {
  loadCesiumImageryLayer,
  loadCesiumTerrainProvider,
  ProviderConfig,
} from "./utils/cesiumProviders";
import { loadTileset, TilesetConfigs } from "./utils/cesiumTilesetProviders";
import { useValidInstances } from "./hooks/useValidInstances";
import { guardScene } from "./utils/guardScene";

import { initAnimationMap, AnimationMap } from "./utils/AnimationMap";

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
  const widgetRef = useRef<CesiumWidget | null>(null);
  const AnimationMapRef = useRef<AnimationMap | null>(initAnimationMap());
  const ellipsoidTerrainProviderRef = useRef(new EllipsoidTerrainProvider());
  const terrainProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const surfaceProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const imageryLayerRef = useRef<ImageryLayer | null>(null);

  const primaryTilesetRef = useRef<Cesium3DTileset | null>(null);
  const secondaryTilesetRef = useRef<Cesium3DTileset | null>(null);
  const shouldSuspendPitchLimiterRef = useRef(false);
  const shouldSuspendCameraLimitersRef = useRef(false);

  // explicitly trigger re-renders
  const [isReady, setisReady] = useState<boolean>(false);
  // Tri-state: null (not started), false (applying), true (settled)
  const [initialCameraSettled, setInitialCameraSettled] = useState<
    boolean | null
  >(null);
  // Monotonic counter for initial camera applications
  const [initialCameraEpoch, setInitialCameraEpoch] = useState<number>(0);

  const {
    withWidget,
    isValidWidget,
    withImageryLayerRef,
    withTerrainProviderRef,
    withEllipsoidTerrainProviderRef,
    withTilesetRef,
  } = useValidInstances(widgetRef);

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
        // Only abort if scene is being destroyed, not during 2D/3D transitions
        !isValidWidget() && abortController.abort();
      };
    } else {
      console.info("[CESIUM|CONTEXT] No imagery provider configured");
    }
  }, [providerConfig.imageryProvider, isValidWidget]);

  useEffect(() => {
    if (!isReady) {
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
      !isValidWidget() && abortController.abort();
    };
  }, [providerConfig.terrainProvider.url, isValidWidget, isReady]);

  useEffect(() => {
    if (!isReady) {
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
        !isValidWidget() && abortController.abort();
      };
    }
  }, [providerConfig.surfaceProvider, isReady, isValidWidget]);

  // Load Primary Tileset
  useEffect(() => {
    if (tilesetConfigs.primary && isReady) {
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
      // Don't destroy providers when transitioning to 2D mode - only when scene is destroyed
      const t = primaryTilesetRef.current;
      if (t && !t.isDestroyed() && !isValidWidget()) {
        console.debug("[CESIUM|DEBUG] Destroying primary tileset");
        t.destroy();
        primaryTilesetRef.current = null;
      }
    };
  }, [tilesetConfigs.primary, isReady, isValidWidget]);

  // Load Secondary Tileset
  useEffect(() => {
    if (tilesetConfigs.secondary && isReady && isValidWidget()) {
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
      // Don't destroy providers when transitioning to 2D mode - only when widget is destroyed
      const t = secondaryTilesetRef.current;
      if (t && !t.isDestroyed() && !isValidWidget()) {
        console.debug("[CESIUM|DEBUG] Destroying secondary tileset");
        t.destroy();
        secondaryTilesetRef.current = null;
      }
    };
  }, [tilesetConfigs.secondary, isReady, isValidWidget]);

  const contextValue = useMemo<CesiumContextType>(
    () => ({
      // Keep legacy name and add the new alias
      widgetRef,
      widgetRef: widgetRef,
      AnimationMapRef,
      shouldSuspendPitchLimiterRef,
      shouldSuspendCameraLimitersRef,
      isReady,
      setisReady,
      initialCameraSettled,
      setInitialCameraSettled,
      initialCameraEpoch,
      bumpInitialCameraEpoch: () => setInitialCameraEpoch((v) => v + 1),
      // NOTE: Workaround for CesiumGS/cesium#12543 — delay/repeat options exist
      // to schedule additional renders in requestRenderMode when needed. These
      // options should be deprecated once upstream behavior is improved.
      isValidWidget,
      isValidWidget: isValidWidget,
      requestRender: (opts) => {
        const renderOnce = () => {
          withWidget((w) => {
            guardScene(w.scene, "ctx requestRender").requestRender();
          });
        };
        handleDelayedRender(renderOnce, opts);
      },
      withWidget,
      withCamera: (cb) => withWidget((w) => cb(w.camera, w)),
      withCanvas: (cb) => withWidget((w) => cb(w.canvas, w)),
      withScene: (cb) => withWidget((w) => cb(w.scene, w)),
      withEntities: (cb) => withWidget((w) => cb(w.entities, w)),
      withImageryLayer: (cb) =>
        withImageryLayerRef(imageryLayerRef, (imageryLayer, widget) =>
          cb(imageryLayer, widget)
        ),
      withPrimaryTileset: (cb) =>
        withTilesetRef(primaryTilesetRef, (tileset, widget) =>
          cb(tileset, widget)
        ),
      withSecondaryTileset: (cb) =>
        withTilesetRef(secondaryTilesetRef, (tileset, widget) =>
          cb(tileset, widget)
        ),
      withEllipsoidTerrainProvider: (cb) =>
        withEllipsoidTerrainProviderRef(
          ellipsoidTerrainProviderRef,
          (provider, widget) => cb(provider, widget)
        ),
      withTerrainProvider: (cb) =>
        withTerrainProviderRef(terrainProviderRef, (provider, widget) =>
          cb(provider, widget)
        ),
      withSurfaceProvider: (cb) =>
        withTerrainProviderRef(surfaceProviderRef, (provider, widget) =>
          cb(provider, widget)
        ),
    }),
    [
      isReady,
      initialCameraSettled,
      initialCameraEpoch,
      isValidWidget,
      withWidget,
      withImageryLayerRef,
      withTerrainProviderRef,
      withEllipsoidTerrainProviderRef,
      withTilesetRef,
    ]
  );

  console.debug(
    "CesiumContextProvider Changed/Rendered",
    isReady,
    contextValue
  );

  return (
    <CesiumContext.Provider value={contextValue}>
      {children}
    </CesiumContext.Provider>
  );
};

export default CesiumContextProvider;
