import React, { useRef } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";

import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";

import {
  CustomViewer,
  CesiumContextProvider,
} from "@carma-mapping/engines/cesium";
import { HashStateProvider } from "@carma-providers/hash-state";
import {
  BASEMAP_METROPOLE_RUHR_WMS_GRAUBLAU,
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
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  return (
    <CesiumContextProvider
      //initialViewerState={defaultViewerState}
      providerConfig={{
        terrainProvider: WUPP_TERRAIN_PROVIDER,
        imageryProvider: BASEMAP_METROPOLE_RUHR_WMS_GRAUBLAU,
      }}
      tilesetConfigs={{
        primary: WUPP_MESH_2024,
        secondary: WUPP_LOD2_TILESET,
      }}
    >
      <HashRouter>
        <HashStateProvider>
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
                  <div
                    style={{
                      position: "relative",
                      width: "100vw",
                      height: "100vh",
                    }}
                  >
                    <div
                      ref={viewerContainerRef}
                      style={{ position: "absolute", inset: 0 }}
                    />
                    <CustomViewer containerRef={viewerContainerRef} />
                    <div
                      style={{
                        pointerEvents: "none",
                        position: "absolute",
                        inset: 0,
                        zIndex: 10,
                      }}
                    >
                      <div style={{ pointerEvents: "auto", height: "100%" }}>
                        <Routes>{ViewerRoutes}</Routes>
                      </div>
                    </div>
                  </div>
                </TopicMapContextProvider>
              }
            />
            {OtherRoutes}
          </Routes>
        </HashStateProvider>
      </HashRouter>
    </CesiumContextProvider>
  );
}
export default App;
