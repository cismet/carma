import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider,
  Viewer,
  Cesium3DTileset,
} from "cesium";

export interface CesiumContextType {
  viewer: Viewer | null;
  setViewer: (viewer: Viewer | null) => void;
  terrainProvider: CesiumTerrainProvider | null;
  surfaceProvider: CesiumTerrainProvider | null;
  //imageryProvider:    | WebMapServiceImageryProvider    | WebMapTileServiceImageryProvider    | null;
  imageryLayer: ImageryLayer | null;
  ellipsoidTerrainProvider: EllipsoidTerrainProvider | null;
  tilesets: {
    primary: Cesium3DTileset | null;
    secondary: Cesium3DTileset | null;
  };
  // TODO add more setters
  setPrimaryTileset: (tileset: Cesium3DTileset | null) => void;
  setSecondaryTileset: (tileset: Cesium3DTileset | null) => void;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);

export const useCesiumContext = () => {
  const context = useContext(CesiumContext);
  if (!context) {
    throw new Error("useViewer must be used within a CesiumContextProvider");
  }
  return context;
};

export const CesiumContextProvider = ({
  children,
  providerConfig,
}: {
  children: ReactNode;
  providerConfig: {
    surfaceProvider?: {
      url: string;
    };
    terrainProvider: {
      url: string;
    };
    imageryProvider: {
      url: string;
      layers: string;
      parameters?: Record<string, string | number | boolean>;
    };
  };
}) => {
  const viewerRef = useRef<Viewer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<Error | null>(null);
  const primaryTilesetRef = useRef<Cesium3DTileset | null>(null);
  const secondaryTilesetRef = useRef<Cesium3DTileset | null>(null);

  const [terrainProvider, setTerrainProvider] =
    useState<CesiumTerrainProvider | null>(null);
  const [surfaceProvider, setSurfaceProvider] =
    useState<CesiumTerrainProvider | null>(null);

  const imageryProvider = new WebMapServiceImageryProvider(
    providerConfig.imageryProvider,
  );

  const setViewer = useCallback((viewer: Viewer | null) => {
    viewerRef.current = viewer;
  }, []);

  const setPrimaryTileset = useCallback((tileset: Cesium3DTileset | null) => {
    primaryTilesetRef.current = tileset;
  }, []);

  const setSecondaryTileset = useCallback((tileset: Cesium3DTileset | null) => {
    secondaryTilesetRef.current = tileset;
  }, []);

  // Initialize Terrain Providers
  useEffect(() => {
    const initializeProviders = async () => {
      try {
        const terrain = await CesiumTerrainProvider.fromUrl(providerConfig.terrainProvider.url);
        setTerrainProvider(terrain);

        if (providerConfig.surfaceProvider) {
          const surface = await CesiumTerrainProvider.fromUrl(providerConfig.surfaceProvider.url);
          setSurfaceProvider(surface);
        }

        setIsLoading(false);
      } catch (err) {
        console.error("Failed to load terrain providers:", err);
        setLoadingError(err as Error);
        setIsLoading(false);
      }
    };
    initializeProviders();
  }, [providerConfig.terrainProvider.url, providerConfig.surfaceProvider]);


  const values: CesiumContextType = {
    viewer: viewerRef.current,
    setViewer,
    ellipsoidTerrainProvider: new EllipsoidTerrainProvider(),
    terrainProvider,
    surfaceProvider,
    imageryLayer: new ImageryLayer(imageryProvider),
    tilesets: {
      primary: primaryTilesetRef.current,
      secondary: secondaryTilesetRef.current,
    },
    setPrimaryTileset,
    setSecondaryTileset,
  };

  if (isLoading) {
    return <div>Loading Cesium providers...</div>;
  }

  if (loadingError) {
    return <div>Error loading Cesium providers: {loadingError.message}</div>;
  }

  console.log("RENDER: CesiumContextProvider Initialized", values);

  return (
    <CesiumContext.Provider value={values}>{children}</CesiumContext.Provider>
  );
};

export default CesiumContextProvider;
