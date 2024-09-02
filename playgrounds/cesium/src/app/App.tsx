import React, { ReactNode } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

// Cesium Styles
import 'cesium/Build/Cesium/Widgets/widgets.css';
import Navigation from './components/Navigation';
import { viewerRoutes, otherRoutes } from './routes';
import {
  CustomViewerPlayground,
  CustomViewerContextProvider,
} from '@carma-mapping/cesium-engine';

import { extentDegreesToRectangle } from '@carma-mapping/cesium-engine/utils';

import { routeGenerator } from './utils/routeGenerator';

import 'leaflet/dist/leaflet.css';

import { TweakpaneProvider } from '@carma-commons/debug';
import { TopicMapContextProvider } from 'react-cismap/contexts/TopicMapContextProvider';
import WUPPERTAL from './config/locations.config';
import defaultViewerState from './config';
import {
  BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
  METROPOLERUHR_WMTS_SPW2_WEBMERCATOR,
  WUPP_TERRAIN_PROVIDER,
} from './config/dataSources.config';
import { MODEL_ASSETS } from './config/assets.config';

const ViewerRoutes = routeGenerator(viewerRoutes);
const OtherRoutes = routeGenerator(otherRoutes);

export function App() {
  return (
    <CustomViewerContextProvider
      viewerState={defaultViewerState}
      providerConfig={{
        terrainProvider: WUPP_TERRAIN_PROVIDER,
        imageryProvider: BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
        models: MODEL_ASSETS,
      }}
    >
      <TweakpaneProvider>
        <HashRouter>
          <Navigation
            className="leaflet-bar"
            style={{
              position: 'absolute',
              top: 8,
              left: '50%',
              width: 'auto',
              display: 'flex',
              justifyContent: 'center',
              transform: 'translate(-50%, 0)',
              zIndex: 10,
            }}
            routes={[...viewerRoutes, ...otherRoutes]}
          />
          <Routes>
            <Route
              path="/*"
              element={
                <TopicMapContextProvider>
                  <CustomViewerPlayground
                    //globe={{cartographicLimitRectangle: extentDegreesToRectangle(WUPPERTAL.extent)}}
                    minimapLayerUrl={
                      METROPOLERUHR_WMTS_SPW2_WEBMERCATOR.layers['spw2_orange']
                        .url
                    }
                  >
                    <Routes>{...ViewerRoutes}</Routes>
                  </CustomViewerPlayground>
                </TopicMapContextProvider>
              }
            />
            {...OtherRoutes}
          </Routes>
        </HashRouter>
      </TweakpaneProvider>
    </CustomViewerContextProvider>
  );
}
export default App;
