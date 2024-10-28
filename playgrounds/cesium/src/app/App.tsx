import React from "react";
import { HashRouter, Route, Routes } from "react-router-dom";

import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";

import {
  CustomViewerPlayground,
  CesiumContextProvider,
} from "@carma-mapping/cesium-engine";
import { TweakpaneProvider } from "@carma-commons/debug";
import {
  BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
  METROPOLERUHR_WMTS_SPW2_WEBMERCATOR,
  WUPP_LOD2_TILESET,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
} from "@carma-commons/resources";

import { Navigation } from "./components/Navigation";
import { viewerRoutes, otherRoutes } from "./routes";
import { routeGenerator } from "./utils/routeGenerator";

import "leaflet/dist/leaflet.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

const ViewerRoutes = routeGenerator(viewerRoutes);
const OtherRoutes = routeGenerator(otherRoutes);

export function App() {
  return (
    <CesiumContextProvider
      //initialViewerState={defaultViewerState}
      providerConfig={{
        terrainProvider: WUPP_TERRAIN_PROVIDER,
        imageryProvider: BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
      }}
      tilesetConfigs={{
        primary: WUPP_MESH_2024,
        secondary: WUPP_LOD2_TILESET,
      }}
    >
      <TweakpaneProvider>
        <HashRouter>
          <Navigation
            className="leaflet-bar"
            style={{
              position: "absolute",
              top: 8,
              left: "50%",
              width: "auto",
              display: "flex",
              justifyContent: "center",
              transform: "translate(-50%, 0)",
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
                      METROPOLERUHR_WMTS_SPW2_WEBMERCATOR.layers["spw2_orange"]
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
    </CesiumContextProvider>
  );
}
export default App;
