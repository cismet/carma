import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Stadtplan } from "./app/Stadtplan";
import { Vorhabenkarte } from "./app/Vorhabenkarte";
import { SimpleMap } from "./app/SimpleMap";
import { SimpleMapWithoutControls } from "./app/SimpleMapWithoutControls";
import "./styles.css";
import { cjsGlobalShim } from "@carma-commons/utils";
import {
  SelectionProvider,
  GazDataProvider,
  AdhocFeatureDisplayProvider,
} from "@carma-appframeworks/portals";
import { SandboxedEvalProvider } from "@carma-commons/sandbox-eval";
import {
  LibreContextProvider,
  MapSelectionProvider,
  MapHighlightProvider,
} from "@carma-mapping/engines/maplibre";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { defaultGazDataConfig } from "@carma-commons/resources";
import BelisPlayground from "./app/BelisPlayground";
import AlkisPlayground from "./app/AlkisPlayground";
import Stadtplan2 from "./app/Stadtplan2";
import { Buildings } from "./app/Buildings";
import { Trees } from "./app/Trees";
import { GenericTreesPlayground } from "./app/GenericTreesPlayground";
import { CustomProfilePlayground } from "./app/CustomProfilePlayground";
import { FilterMap } from "./app/FilterMap";
import { PointCloudPlayground } from "./app/pointcloud/PointCloudPlayground";
import {
  backgroundModes,
  backgroundConfigurations,
} from "./app/backgroundConfig";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

cjsGlobalShim();

root.render(
  <StrictMode>
    <SandboxedEvalProvider>
      <HashRouter>
        <TopicMapContextProvider
          infoBoxPixelWidth={350}
          backgroundModes={backgroundModes}
          backgroundConfigurations={backgroundConfigurations}
        >
          <GazDataProvider config={defaultGazDataConfig}>
            <SelectionProvider>
              <AdhocFeatureDisplayProvider>
                <LibreContextProvider>
                  <MapSelectionProvider debug>
                    <MapHighlightProvider debug>
                    <Routes>
                      <Route
                        path="/"
                        element={<Navigate to="/stadtplan" replace />}
                      />
                      <Route path="/stadtplan" element={<Stadtplan />} />
                      <Route
                        path="/vorhabenkarte"
                        element={<Vorhabenkarte />}
                      />
                      <Route path="/simple" element={<SimpleMap />} />
                      <Route
                        path="/simpleWithoutControls"
                        element={<SimpleMapWithoutControls />}
                      />
                      <Route path="/belis" element={<BelisPlayground />} />
                      <Route path="/alkis" element={<AlkisPlayground />} />
                      <Route path="/stadtplan2" element={<Stadtplan2 />} />
                      <Route path="/buildings" element={<Buildings />} />
                      <Route path="/trees" element={<Trees />} />
                      <Route
                        path="/trees-dev"
                        element={<GenericTreesPlayground />}
                      />
                      <Route
                        path="/custom-profile"
                        element={<CustomProfilePlayground />}
                      />
                      <Route path="/filter" element={<FilterMap />} />
                      <Route
                        path="/pointcloud"
                        element={<PointCloudPlayground />}
                      />
                    </Routes>
                    </MapHighlightProvider>
                  </MapSelectionProvider>
                </LibreContextProvider>
              </AdhocFeatureDisplayProvider>
            </SelectionProvider>
          </GazDataProvider>
        </TopicMapContextProvider>
      </HashRouter>
    </SandboxedEvalProvider>
  </StrictMode>
);
