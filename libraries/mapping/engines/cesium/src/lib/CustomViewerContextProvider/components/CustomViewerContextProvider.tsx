import { createContext, useContext } from 'react';

import { ReactNode } from 'react';
import { Provider } from 'react-redux';

import { setupStore } from '../store';
import {
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider,
} from 'cesium';
import { ModelAsset, ViewerState } from '../../..';

export type CustomViewerContextType = {
  terrainProvider: Promise<CesiumTerrainProvider> | null;
  //imageryProvider:    | WebMapServiceImageryProvider    | WebMapTileServiceImageryProvider    | null;
  imageryLayer: ImageryLayer | null;
  ellipsoidTerrainProvider: EllipsoidTerrainProvider | null;
  models: Record<string, ModelAsset> | null;
};

export const CustomViewerContext = createContext<CustomViewerContextType>({
  terrainProvider: null,
  //imageryProvider: null,
  imageryLayer: null,
  ellipsoidTerrainProvider: null,
  models: null,
});

export const useCustomViewerContext = () => {
  return useContext<CustomViewerContextType>(CustomViewerContext);
};

export const CustomViewerContextProvider = ({
  children,
  viewerState,
  providerConfig,
}: {
  children: ReactNode;
  viewerState: ViewerState;
  providerConfig: {
    models: Record<string, ModelAsset>;
    terrainProvider: {
      url: string;
    };
    imageryProvider: {
      url: string;
      layers: string;
      parameters?: {
        transparent?: boolean;
        format?: string;
      };
    };
  };
}) => {
  const store = setupStore(viewerState);

  const imageryProvider = new WebMapServiceImageryProvider(
    providerConfig.imageryProvider
  );

  const values = {
    ellipsoidTerrainProvider: new EllipsoidTerrainProvider(),
    terrainProvider: CesiumTerrainProvider.fromUrl(
      providerConfig.terrainProvider.url
    ),
    imageryLayer: new ImageryLayer(imageryProvider),
    models: providerConfig.models,
  };

  return (
    <Provider store={store}>
      <CustomViewerContext.Provider value={values}>
        {children}
      </CustomViewerContext.Provider>
    </Provider>
  );
};

export default CustomViewerContextProvider;
