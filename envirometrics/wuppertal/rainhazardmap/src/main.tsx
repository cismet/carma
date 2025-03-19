import "./index.css";
import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { GazDataProvider, SelectionProvider } from "@carma-apps/portals";
import App from "./App";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import CrossTabCommunicationContextProvider from "react-cismap/contexts/CrossTabCommunicationContextProvider";

import { gazDataConfig } from "./config/gazData";

const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);
console.warn = (message, ...args) => {
  if (!message.includes("ReactDOM.render is no longer supported in React 18")) {
    originalWarn(message, ...args);
  }
};
console.error = (message, ...args) => {
  if (!message.includes("ReactDOM.render is no longer supported in React 18")) {
    originalError(message, ...args);
  }
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <StrictMode>
    <GazDataProvider config={gazDataConfig}>
      <SelectionProvider>
        <CrossTabCommunicationContextProvider
          role="sync"
          token="floodingAndRainhazardSyncWupp"
        >
          <TopicMapContextProvider
            appKey={"cismetRainhazardMap.Wuppertal"}
            referenceSystem={MappingConstants.crs3857}
            referenceSystemDefinition={MappingConstants.proj4crs3857def}
            infoBoxPixelWidth={370}
          >
            <App />
          </TopicMapContextProvider>
        </CrossTabCommunicationContextProvider>
      </SelectionProvider>
    </GazDataProvider>
  </StrictMode>
);
