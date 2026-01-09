import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";

import { App } from "./app/App";

import "./styles.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "leaflet/dist/leaflet.css";
import {
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";
import { DatasheetProvider } from "@carma-mapping/components";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <StrictMode>
    <DatasheetProvider>
      <GazDataProvider>
        <SelectionProvider>
          <TopicMapContextProvider>
            <App />
          </TopicMapContextProvider>
        </SelectionProvider>
      </GazDataProvider>
    </DatasheetProvider>
  </StrictMode>
);
