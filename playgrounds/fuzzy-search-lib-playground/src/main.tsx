import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";

import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";

import { GazDataProvider } from "@carma-apps/portals";

import { App } from "./app/App";

import "./styles.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "leaflet/dist/leaflet.css";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <StrictMode>
    <GazDataProvider>
      <TopicMapContextProvider>
        <App />
      </TopicMapContextProvider>
    </GazDataProvider>
  </StrictMode>
);
