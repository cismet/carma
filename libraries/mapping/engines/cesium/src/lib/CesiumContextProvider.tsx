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
import type { TilesetConfig } from "@carma-commons/resources";

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

  // explicitly trigger re-renders
  const [isViewerReady, setIsViewerReady] = useState<boolean>(false);
  const [selectedPrimaryIndex, setSelectedPrimaryIndex] = useState<number>(0);

  // Get available mesh options from resources
  const [primaryTilesetOptions, setPrimaryTilesetOptions] = useState<
    TilesetConfig[]
  >([]);

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
      primaryTilesetOptions.length > 0 &&
      isViewerReady &&
      viewerRef.current &&
      !viewerRef.current.isDestroyed()
    ) {
      const fetchPrimary = async () => {
        const selectedConfig = primaryTilesetOptions[selectedPrimaryIndex];
        console.debug("[CESIUM|DEBUG] Loading primary tileset", selectedConfig);
        primaryTilesetRef.current = await loadTileset(selectedConfig);
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
  }, [primaryTilesetOptions, selectedPrimaryIndex, viewerRef, isViewerReady]);

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

  useEffect(() => {
    const loadMeshOptions = async () => {
      try {
        setPrimaryTilesetOptions(
          Array.isArray(tilesetConfigs.primary)
            ? tilesetConfigs.primary
            : [tilesetConfigs.primary]
        );
      } catch (error) {
        console.warn("[CESIUM|DEBUG] Failed to load mesh configs:", error);
      }
    };
    loadMeshOptions();
  }, [tilesetConfigs.primary]);

  const switchPrimaryTileset = useCallback(
    async (index: number) => {
      if (index < 0 || index >= primaryTilesetOptions.length) {
        console.warn("[CESIUM|DEBUG] Invalid tileset index:", index);
        return;
      }

      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) {
        console.warn("[CESIUM|DEBUG] Viewer not ready for tileset switch");
        return;
      }

      // Remove current primary tileset safely
      if (primaryTilesetRef.current) {
        try {
          // Check if tileset is not already destroyed before removing/destroying
          if (!primaryTilesetRef.current.isDestroyed()) {
            viewer.scene.primitives.remove(primaryTilesetRef.current);
            primaryTilesetRef.current.destroy();
          }
        } catch (error) {
          console.warn("[CESIUM|DEBUG] Error removing primary tileset:", error);
        } finally {
          primaryTilesetRef.current = null;
        }
      }

      try {
        const meshOption = primaryTilesetOptions[index];
        console.debug(
          "[CESIUM|DEBUG] Switching to primary tileset:",
          meshOption
        );

        setSelectedPrimaryIndex(index);
        primaryTilesetRef.current = await loadTileset(meshOption);
        viewer.scene.primitives.add(primaryTilesetRef.current);

        console.debug("[CESIUM|DEBUG] Successfully switched primary tileset");
      } catch (error) {
        console.error(
          "[CESIUM|DEBUG] Failed to switch primary tileset:",
          error
        );
      }
    },
    [viewerRef, primaryTilesetRef, primaryTilesetOptions]
  );

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
      switchPrimaryTileset,
      primaryTilesetOptions: primaryTilesetOptions.map((config, index) => ({
        index,
        displayName: config.displayName || config.key,
        displayNameShort: config.displayNameShort || config.key,
        key: config.key,
      })),
    }),
    [isViewerReady, switchPrimaryTileset, primaryTilesetOptions]
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
