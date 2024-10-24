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

export const CesiumContextProvider = ({
  children,
  providerConfig,
}: {
  children: ReactNode;
  providerConfig: ProviderConfig;
}) => {
  // Use refs for Cesium instances to prevent re-renders
  const viewerRef = useRef<Viewer | null>(null);
  const ellipsoidTerrainProviderRef = useRef(new EllipsoidTerrainProvider());
  const terrainProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const surfaceProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const imageryLayerRef = useRef<ImageryLayer | null>(null);

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

  const contextValue = useMemo<CesiumContextType>(
    () => ({
      viewerRef,
      ellipsoidTerrainProviderRef,
      terrainProviderRef,
      surfaceProviderRef,
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
