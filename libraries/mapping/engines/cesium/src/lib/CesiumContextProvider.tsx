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
  const primaryTilesetsRef = useRef<(Cesium3DTileset | null)[]>([]);
  const secondaryTilesetsRef = useRef<(Cesium3DTileset | null)[]>([]);
  const shouldSuspendPitchLimiterRef = useRef(false);

  // State for UI
  const [isViewerReady, setIsViewerReady] = useState<boolean>(false);
  const [selectedPrimaryTilesetIndex, setSelectedPrimaryTilesetIndex] =
    useState<number>(0);
  const [selectedSecondaryTilesetIndex, setSelectedSecondaryTilesetIndex] =
    useState<number>(0);
  const [tilesetsLoadedCounter, setTilesetsLoadedCounter] = useState<number>(0);

  // Convert configs to arrays for consistent handling
  const primaryTilesetConfigs = useMemo(() => {
    return Array.isArray(tilesetConfigs.primary)
      ? tilesetConfigs.primary
      : [tilesetConfigs.primary];
  }, [tilesetConfigs.primary]);

  const secondaryTilesetConfigs = useMemo(() => {
    if (!tilesetConfigs.secondary) return [];
    return Array.isArray(tilesetConfigs.secondary)
      ? tilesetConfigs.secondary
      : [tilesetConfigs.secondary];
  }, [tilesetConfigs.secondary]);

  const shouldSelectPrimaryTileset = useCallback(async (index: number) => {
    console.debug("[CESIUM|DEBUG] Selecting primary tileset index:", index);
    setSelectedPrimaryTilesetIndex(index);
  }, []);

  const shouldSelectSecondaryTileset = useCallback(async (index: number) => {
    console.debug("[CESIUM|DEBUG] Selecting secondary tileset index:", index);
    setSelectedSecondaryTilesetIndex(index);
  }, []);

  // Load Primary Tilesets
  useEffect(() => {
    if (
      !isViewerReady ||
      !viewerRef.current ||
      viewerRef.current.isDestroyed()
    ) {
      return;
    }

    const loadPrimaryTilesets = async () => {
      console.debug(
        "[CESIUM|DEBUG] Loading primary tilesets",
        primaryTilesetConfigs
      );

      // Clear existing tilesets
      primaryTilesetsRef.current.forEach((tileset) => {
        if (tileset && !tileset.isDestroyed()) {
          tileset.destroy();
        }
      });
      primaryTilesetsRef.current = [];

      // Load new tilesets
      const loadPromises = primaryTilesetConfigs.map(async (config, index) => {
        try {
          const tileset = await loadTileset(config);
          primaryTilesetsRef.current[index] = tileset;
          console.debug(
            `[CESIUM|DEBUG] Loaded primary tileset ${index}`,
            tileset
          );
          return tileset;
        } catch (error) {
          console.error(
            `[CESIUM|DEBUG] Failed to load primary tileset ${index}:`,
            error
          );
          primaryTilesetsRef.current[index] = null;
          return null;
        }
      });

      await Promise.all(loadPromises);
      setTilesetsLoadedCounter((prev) => prev + 1);
    };

    loadPrimaryTilesets().catch(console.error);

    return () => {
      primaryTilesetsRef.current.forEach((tileset) => {
        if (tileset && !tileset.isDestroyed()) {
          tileset.destroy();
        }
      });
      primaryTilesetsRef.current = [];
    };
  }, [primaryTilesetConfigs, isViewerReady]);

  // Load Secondary Tilesets
  useEffect(() => {
    if (
      !isViewerReady ||
      !viewerRef.current ||
      viewerRef.current.isDestroyed()
    ) {
      return;
    }

    const loadSecondaryTilesets = async () => {
      console.debug(
        "[CESIUM|DEBUG] Loading secondary tilesets",
        secondaryTilesetConfigs
      );

      // Clear existing tilesets
      secondaryTilesetsRef.current.forEach((tileset) => {
        if (tileset && !tileset.isDestroyed()) {
          tileset.destroy();
        }
      });
      secondaryTilesetsRef.current = [];

      // Load new tilesets
      const loadPromises = secondaryTilesetConfigs.map(
        async (config, index) => {
          try {
            const tileset = await loadTileset(config);
            secondaryTilesetsRef.current[index] = tileset;
            console.debug(
              `[CESIUM|DEBUG] Loaded secondary tileset ${index}`,
              tileset
            );
            return tileset;
          } catch (error) {
            console.error(
              `[CESIUM|DEBUG] Failed to load secondary tileset ${index}:`,
              error
            );
            secondaryTilesetsRef.current[index] = null;
            return null;
          }
        }
      );

      await Promise.all(loadPromises);
      setTilesetsLoadedCounter((prev) => prev + 1);
    };

    if (secondaryTilesetConfigs.length > 0) {
      loadSecondaryTilesets().catch(console.error);
    }

    return () => {
      secondaryTilesetsRef.current.forEach((tileset) => {
        if (tileset && !tileset.isDestroyed()) {
          tileset.destroy();
        }
      });
      secondaryTilesetsRef.current = [];
    };
  }, [secondaryTilesetConfigs, isViewerReady]);

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

  const contextValue = useMemo<CesiumContextType>(
    () => ({
      viewerRef,
      viewerAnimationMapRef,
      ellipsoidTerrainProviderRef,
      terrainProviderRef,
      surfaceProviderRef,
      imageryLayerRef,
      primaryTilesetsRef,
      secondaryTilesetsRef,
      shouldSuspendPitchLimiterRef,
      isViewerReady,
      setIsViewerReady,
      shouldSelectPrimaryTileset,
      shouldSelectSecondaryTileset,
      primaryTilesetConfigs,
      secondaryTilesetConfigs,
      selectedPrimaryTilesetIndex,
      selectedSecondaryTilesetIndex,
      tilesetsLoadedCounter,
    }),
    [
      isViewerReady,
      shouldSelectPrimaryTileset,
      shouldSelectSecondaryTileset,
      primaryTilesetConfigs,
      secondaryTilesetConfigs,
      selectedPrimaryTilesetIndex,
      selectedSecondaryTilesetIndex,
      tilesetsLoadedCounter,
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
