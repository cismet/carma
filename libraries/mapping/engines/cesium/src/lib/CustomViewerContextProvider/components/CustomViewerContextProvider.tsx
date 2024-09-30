import { createContext, useContext, useState } from "react";
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

export interface CustomViewerContextType {
  viewer: Viewer | null;
  setViewer: ((viewer: Viewer | null) => void);
  terrainProvider: Promise<CesiumTerrainProvider> | CesiumTerrainProvider | null;
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

export const CustomViewerContext = createContext<CustomViewerContextType | null>(null);

// TODO: rename this
export const useCesiumCustomViewer = () => {
  const context = useContext(CustomViewerContext);
  if (!context) {
    throw new Error('useViewer must be used within a CustomViewerProvider');
  }
  return context;
};

export const CustomViewerContextProvider = ({
  children,
  providerConfig,
}: {
  children: ReactNode;
  providerConfig: {
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


  const imageryProvider = new WebMapServiceImageryProvider(
    providerConfig.imageryProvider,
  );

  const values = {
    viewer,
    setViewer,
    ellipsoidTerrainProvider: new EllipsoidTerrainProvider(),
    terrainProvider: CesiumTerrainProvider.fromUrl(
      providerConfig.terrainProvider.url,
    ),
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
    <CustomViewerContext.Provider value={values}>
      {children}
    </CustomViewerContext.Provider>
  );
};

export default CustomViewerContextProvider;
