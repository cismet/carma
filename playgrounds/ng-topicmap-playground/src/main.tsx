import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import { App } from "./app/App";
import { SimpleMap } from "./app/SimpleMap";
import { SimpleMapWithoutControls } from "./app/SimpleMapWithoutControls";
import "./styles.css";
import { cjsGlobalShim } from "@carma-commons/utils";
import {
  SelectionProvider,
  GazDataProvider,
} from "@carma-appframeworks/portals";
import { LibreContextProvider } from "@carma-mapping/engines/maplibre";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { defaultGazDataConfig } from "@carma-commons/resources";
import BelisPlayground from "./app/BelisPlayground";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

cjsGlobalShim();

root.render(
  <StrictMode>
    <HashRouter>
      <TopicMapContextProvider infoBoxPixelWidth={350}>
        <GazDataProvider config={defaultGazDataConfig}>
          <SelectionProvider>
            <LibreContextProvider>
              <Routes>
                <Route path="/" element={<App />} />
                <Route path="/simple" element={<SimpleMap />} />
                <Route
                  path="/simpleWithoutControls"
                  element={<SimpleMapWithoutControls />}
                />
                <Route path="/belis" element={<BelisPlayground />} />
              </Routes>
            </LibreContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </TopicMapContextProvider>
    </HashRouter>
  </StrictMode>
);
