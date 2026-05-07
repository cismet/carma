import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { cjsGlobalShim } from "@carma-commons/utils";
import {
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";
import { SandboxedEvalProvider } from "@carma-commons/sandbox-eval";
import {
  LibreContextProvider,
  MapSelectionProvider,
  MapHighlightProvider,
} from "@carma-mapping/engines/maplibre";
import { defaultGazDataConfig } from "@carma-commons/resources";
import { App } from "./app/App";
import {
  backgroundModes,
  backgroundConfigurations,
} from "./app/backgroundConfig";
import "./styles.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

cjsGlobalShim();

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <StrictMode>
    <SandboxedEvalProvider>
      <TopicMapContextProvider
        appKey="measurements-playground-maplibre"
        infoBoxPixelWidth={350}
        backgroundModes={backgroundModes}
        backgroundConfigurations={backgroundConfigurations}
      >
        <GazDataProvider config={defaultGazDataConfig}>
          <SelectionProvider>
            <LibreContextProvider>
              <MapSelectionProvider>
                <MapHighlightProvider>
                  <App />
                </MapHighlightProvider>
              </MapSelectionProvider>
            </LibreContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </TopicMapContextProvider>
    </SandboxedEvalProvider>
  </StrictMode>
);
