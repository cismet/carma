import { useEffect, useMemo, useRef } from "react";
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
  const ellipsoidTerrainProviderRef = useRef(new EllipsoidTerrainProvider());
  const terrainProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const surfaceProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const imageryLayerRef = useRef<ImageryLayer | null>(null);
  const hq500ProviderRef = useRef<CesiumTerrainProvider | null >(null);

  const primaryTilesetRef = useRef<Cesium3DTileset | null>(null);
  const secondaryTilesetRef = useRef<Cesium3DTileset | null>(null);

  // Asynchronous initialization of providers and imageryLayer
  useEffect(() => {
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
  }, [providerConfig.imageryProvider]);

  useEffect(() => {
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
  }, [providerConfig.terrainProvider.url]);

  useEffect(() => {
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
  }, [providerConfig.surfaceProvider]);

  useEffect(() => {
    if (providerConfig.hq500Provider) {
      const abortController = new AbortController();
      const { signal } = abortController;

      loadCesiumTerrainProvider(
        hq500ProviderRef,
        providerConfig.hq500Provider.url,
        signal
      );

      return () => {
        abortController.abort();
      };
    }
  }, [providerConfig.hq500Provider]);

  // Load Primary Tileset
  useEffect(() => {
    if (tilesetConfigs.primary) {
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
    }

    return () => {
      if (primaryTilesetRef.current) {
        primaryTilesetRef.current.destroy();
        primaryTilesetRef.current = null;
      }
    };
  }, [tilesetConfigs.primary]);

  // Load Secondary Tileset
  useEffect(() => {
    if (tilesetConfigs.secondary) {
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
    }

    return () => {
      if (secondaryTilesetRef.current) {
        secondaryTilesetRef.current.destroy();
        secondaryTilesetRef.current = null;
      }
    };
  }, [tilesetConfigs.secondary]);


  const contextValue = useMemo<CesiumContextType>(
    () => ({
      viewerRef,
      ellipsoidTerrainProviderRef,
      terrainProviderRef,
      surfaceProviderRef,
      hq500ProviderRef,
      imageryLayerRef,
      tilesetsRefs: {
        primaryRef: primaryTilesetRef,
        secondaryRef: secondaryTilesetRef,
      },
    }),
    []
  );

  console.debug("CesiumContextProvider Initialized", contextValue);

  return (
    <CesiumContext.Provider value={contextValue}>
      {children}
    </CesiumContext.Provider>
  );
};

export default CesiumContextProvider;
