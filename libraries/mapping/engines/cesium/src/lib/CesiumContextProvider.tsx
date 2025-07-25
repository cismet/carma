import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export const CesiumContextProvider = ({
  children,
  providerConfig,
  tilesetConfigs,
  storagePrefix = "cesium",
}: {
  children: ReactNode;
  providerConfig: ProviderConfig;
  tilesetConfigs: TilesetConfigs;
  storagePrefix?: string;
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

  // explicitly trigger re-renders
  const [isViewerReady, setIsViewerReady] = useState<boolean>(false);

  // Cesium disabled state management
  const [isCesiumDisabled, setIsCesiumDisabled] = useState<boolean>(() => {
    // Initialize from storage on mount with configurable prefix
    const isPermanentlyDisabled =
      localStorage.getItem(`${storagePrefix}-cesium-disabled`) === "true";
    const isSessionDisabled =
      sessionStorage.getItem(`${storagePrefix}-cesium-session-disabled`) ===
      "true";
    return isPermanentlyDisabled || isSessionDisabled;
  });

  const handleSetCesiumDisabled = useCallback(
    (disabled: boolean, permanent: boolean = false) => {
      if (permanent) {
        if (disabled) {
          localStorage.setItem(`${storagePrefix}-cesium-disabled`, "true");
        } else {
          localStorage.removeItem(`${storagePrefix}-cesium-disabled`);
        }
        // Also clear session storage when enabling
        sessionStorage.removeItem(`${storagePrefix}-cesium-session-disabled`);
      } else {
        if (disabled) {
          sessionStorage.setItem(
            `${storagePrefix}-cesium-session-disabled`,
            "true"
          );
        } else {
          sessionStorage.removeItem(`${storagePrefix}-cesium-session-disabled`);
        }
      }
      setIsCesiumDisabled(disabled);
    },
    [storagePrefix]
  );

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
      isViewerReady,
      setIsViewerReady,
      isCesiumDisabled,
      setIsCesiumDisabled: handleSetCesiumDisabled,
    }),
    [isViewerReady, isCesiumDisabled, handleSetCesiumDisabled]
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
