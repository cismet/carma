import React from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Provider } from "react-redux";

import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";

import {
  CustomViewerPlayground,
  CesiumContextProvider,
} from "../lib/cesium-engine-snapshot/src";
import { LevaProvider } from "../lib/debug/LevaProvider";
import { METROPOLE_RUHR_WMTS_SPW2_WEBMERCATOR } from "@carma/resources";
import {
  BASEMAP_METROPOLE_RUHR_SNAPSHOT,
  WUPP_LOD2_TILESET_SNAPSHOT,
  WUPP_MESH_2024_SNAPSHOT,
  WUPP_TERRAIN_PROVIDER,
} from "./config/snapshot-resources";

import { Navigation } from "./components/Navigation";
import { viewerRoutes, otherRoutes } from "./routes";
import { routeGenerator } from "./utils/routeGenerator";
import { setupStore } from "./store";
import defaultViewerState from "./config";

import "leaflet/dist/leaflet.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

const ViewerRoutes = routeGenerator(viewerRoutes);
const OtherRoutes = routeGenerator(otherRoutes);
const store = setupStore(defaultViewerState);

export function App() {
  return (
    <Provider store={store}>
      <CesiumContextProvider
        providerConfig={{
          terrainProvider: WUPP_TERRAIN_PROVIDER,
          imageryProvider: BASEMAP_METROPOLE_RUHR_SNAPSHOT,
        }}
        tilesetConfigs={{
          primary: WUPP_MESH_2024_SNAPSHOT,
          secondary: WUPP_LOD2_TILESET_SNAPSHOT,
        }}
      >
        <LevaProvider>
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
                        METROPOLE_RUHR_WMTS_SPW2_WEBMERCATOR.layers[
                          "spw2_orange"
                        ].url
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
        </LevaProvider>
      </CesiumContextProvider>
    </Provider>
  );
}
export default App;
