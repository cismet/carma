import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Viewer,
  Cesium3DTileset,
} from "cesium";

import { CesiumContext, type CesiumContextType } from "./CesiumContext";
import {
  loadCesiumImageryLayer,
  loadCesiumTerrainProvider,
  ProviderConfig,
} from "./utils/cesiumProviders";
import { loadTileset, TilesetConfigs } from "./utils/cesiumTilesetProviders";
import {
  initViewerAnimationMap,
  ViewerAnimationMap,
} from "./utils/viewerAnimationMap";
import { createRequestRender } from "./utils/requestRender";

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
        abortController.abort();
      };
    } else {
      console.info("[CESIUM|CONTEXT] No imagery provider configured");
    }
  }, [providerConfig.imageryProvider]);

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
      abortController.abort();
    };
  }, [providerConfig.terrainProvider.url, isViewerReady]);

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
        abortController.abort();
      };
    }
  }, [providerConfig.surfaceProvider, isViewerReady]);

  // Load Primary Tileset
  useEffect(() => {
    if (
      tilesetConfigs.primary &&
      isViewerReady &&
      viewerRef.current &&
      !viewerRef.current.isDestroyed()
    ) {
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
      if (primaryTilesetRef.current) {
        primaryTilesetRef.current.destroy();
        primaryTilesetRef.current = null;
      }
    };
  }, [tilesetConfigs.primary, viewerRef, isViewerReady]);

  // Load Secondary Tileset
  useEffect(() => {
    if (
      tilesetConfigs.secondary &&
      isViewerReady &&
      viewerRef.current &&
      !viewerRef.current.isDestroyed()
    ) {
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
      if (secondaryTilesetRef.current) {
        secondaryTilesetRef.current.destroy();
        secondaryTilesetRef.current = null;
      }
    };
  }, [tilesetConfigs.secondary, viewerRef, isViewerReady]);

  const contextValue = useMemo<CesiumContextType>(
    () => ({
      viewerRef,
      viewerAnimationMapRef,
      ellipsoidTerrainProviderRef,
      terrainProviderRef,
      surfaceProviderRef,
      imageryLayerRef,
      tilesetsRefs: {
        primaryRef: primaryTilesetRef,
        secondaryRef: secondaryTilesetRef,
      },
      shouldSuspendPitchLimiterRef,
      shouldSuspendCameraLimitersRef,
      isViewerReady,
      setIsViewerReady,
      // NOTE: Workaround for CesiumGS/cesium#12543 — delay/repeat options exist
      // to schedule additional renders in requestRenderMode when needed. These
      // options should be deprecated once upstream behavior is improved.
      requestRender: createRequestRender(viewerRef),
      isViewerValid: () => !!(function () {
        const v = viewerRef.current;
        return v && !v.isDestroyed() && v.scene && !v.scene.isDestroyed() && v.camera;
      })(),
      validateViewer: () => {
        const ctx = (function () {
          const v = viewerRef.current;
          if (v && !v.isDestroyed()) {
            const scene = v.scene;
            const camera = v.camera;
            if (scene && !scene.isDestroyed() && camera) {
              return { viewer: v, camera, scene };
            }
          }
          return null;
        })();
        return ctx;
      },
      withViewer: (cb) => {
        const ctx = (function () {
          const v = viewerRef.current;
          if (v && !v.isDestroyed()) {
            const scene = v.scene;
            const camera = v.camera;
            if (scene && !scene.isDestroyed() && camera) {
              return { viewer: v, camera, scene };
            }
          }
          return null;
        })();
        if (ctx) cb(ctx);
      },
      removeEntityById: (id: string) => {
        const v = viewerRef.current;
        if (v && !v.isDestroyed() && v.entities) {
          try {
            return v.entities.removeById(id);
          } catch (_err) {
            return false;
          }
        }
        return false;
      },
    }),
    [isViewerReady]
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
