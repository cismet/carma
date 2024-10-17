import { createContext, useContext, useEffect, useState } from "react";
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
  setViewer: ((viewer: Viewer | null) => void);
  terrainProvider: CesiumTerrainProvider | null;
  surfaceProvider: CesiumTerrainProvider | null;
  //imageryProvider:    | WebMapServiceImageryProvider    | WebMapTileServiceImageryProvider    | null;
  imageryLayer: ImageryLayer | null;
  ellipsoidTerrainProvider: EllipsoidTerrainProvider | null;
  tilesets: {
    primary: Cesium3DTileset | null;
    secondary: Cesium3DTileset | null;
  }
  // TODO add more setters
  setPrimaryTileset: ((tileset: Cesium3DTileset | null) => void);
  setSecondaryTileset: ((tileset: Cesium3DTileset | null) => void);
};

export const CesiumContext = createContext<CesiumContextType | null>(null);

export const useCesiumContext = () => {
  const context = useContext(CesiumContext);
  if (!context) {
    throw new Error('useViewer must be used within a CesiumContextProvider');
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
  }
}) => {

  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [primaryTileset, setPrimaryTileset] = useState<Cesium3DTileset | null>(null);
  const [secondaryTileset, setSecondaryTileset] = useState<Cesium3DTileset | null>(null);
  const [terrainProvider, setTerrainProvider] = useState<CesiumTerrainProvider | null>(null);
  const [surfaceProvider, setSurfaceProvider] = useState<CesiumTerrainProvider | null>(null);



  const imageryProvider = new WebMapServiceImageryProvider(
    providerConfig.imageryProvider,
  );


  useEffect(() => {
    (async () => {
      try {
        setTerrainProvider(await CesiumTerrainProvider.fromUrl(providerConfig.terrainProvider.url));
      } catch (error) {
        console.error("Failed to load terrain provider:", error);
      }
    })();
  }, [providerConfig.terrainProvider.url]);

  useEffect(() => {
    (async () => {
      try {
        providerConfig.surfaceProvider && setSurfaceProvider(await CesiumTerrainProvider.fromUrl(providerConfig.surfaceProvider.url));
      } catch (error) {
        console.error("Failed to load terrain provider:", error);
      }
    })();
  }, [providerConfig.surfaceProvider]);

  const values: CesiumContextType = {
    viewer,
    setViewer,
    ellipsoidTerrainProvider: new EllipsoidTerrainProvider(),
    terrainProvider,
    surfaceProvider,
    imageryLayer: new ImageryLayer(imageryProvider),
    tilesets: {
      primary: primaryTileset,
      secondary: secondaryTileset,
    },
    setPrimaryTileset,
    setSecondaryTileset,
  };

  console.log('Cesium CustomViewerContextProvider Initialized', values);

  return (
    <CesiumContext.Provider value={values}>
      {children}
    </CesiumContext.Provider>
  );
};

export default CesiumContextProvider;
