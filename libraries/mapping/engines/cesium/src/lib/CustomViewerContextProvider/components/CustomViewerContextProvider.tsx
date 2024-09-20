import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

import {
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider,
  Viewer,
} from "cesium";
import { ModelAsset } from "../../..";

export interface CustomViewerContextType {
  viewer: Viewer | null;
  setViewer: null | ((viewer: Viewer | null) => void);
  terrainProvider: Promise<CesiumTerrainProvider> | CesiumTerrainProvider | null;
  //imageryProvider:    | WebMapServiceImageryProvider    | WebMapTileServiceImageryProvider    | null;
  imageryLayer: ImageryLayer | null;
  ellipsoidTerrainProvider: EllipsoidTerrainProvider | null;
  models: Record<string, ModelAsset> | null;
};

export const CustomViewerContext = createContext<CustomViewerContextType>({
  viewer: null,
  setViewer: null,
  terrainProvider: null,
  //imageryProvider: null,
  imageryLayer: null,
  ellipsoidTerrainProvider: null,
  models: null,
});

// TODO: rename this
export const useCesiumCustomViewer = () => {
  const context = useContext(CustomViewerContext);
  if (context === undefined) {
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
    models: Record<string, ModelAsset> | null;
  }
}) => {

  const [viewer, setViewerState] = useState<Viewer | null>(null);

  const setViewer = useCallback((newViewer: Viewer | null) => {
    setViewerState(newViewer);
    // You can add any additional logic here when the viewer changes
  }, []);

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
    models: providerConfig.models,
  };

  console.log('Cesium CustomViewerContextProvider Initialized', values);

  return (
    <CustomViewerContext.Provider value={values}>
      {children}
    </CustomViewerContext.Provider>
  );
};

export default CustomViewerContextProvider;
