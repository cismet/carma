import React from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

// Cesium Styles
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { Navigation } from './components/Navigation';
import { viewerRoutes, otherRoutes } from './routes';
import {
  CustomViewerPlayground,
  CustomViewerContextProvider,
} from '@carma-mapping/cesium-engine';


import { routeGenerator } from './utils/routeGenerator';

import 'leaflet/dist/leaflet.css';

import { TopicMapContextProvider } from 'react-cismap/contexts/TopicMapContextProvider';

import { TweakpaneProvider } from '@carma-commons/debug';
import { BASEMAP_METROPOLRUHR_WMS_GRAUBLAU, METROPOLERUHR_WMTS_SPW2_WEBMERCATOR, WUPP_TERRAIN_PROVIDER } from '@carma-commons/resources';

const ViewerRoutes = routeGenerator(viewerRoutes);
const OtherRoutes = routeGenerator(otherRoutes);

export function App() {
  return (
    <CustomViewerContextProvider
      //initialViewerState={defaultViewerState}
      providerConfig={{
        terrainProvider: WUPP_TERRAIN_PROVIDER,
        imageryProvider: BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
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
