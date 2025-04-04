import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { GazDataProvider, SelectionProvider } from "@carma-apps/portals";
import { gazDataConfig } from "./config/gazData";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import config from "./config";

const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);
console.warn = (message, ...args) => {
  if (
    message &&
    message.includes &&
    !message.includes("ReactDOM.render is no longer supported in React 18")
  ) {
    originalWarn(message, ...args);
  }
};
console.error = (message, ...args) => {
  if (
    message &&
    message.includes &&
    !message.includes("ReactDOM.render is no longer supported in React 18")
  ) {
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
        <TopicMapContextProvider
          appKey={"cismetRainhazardMap.Korschenbroich"}
          referenceSystem={MappingConstants.crs3857}
          referenceSystemDefinition={MappingConstants.proj4crs3857def}
          infoBoxPixelWidth={370}
          baseLayerConf={config.overridingBaseLayerConf}
        >
          <App />
        </TopicMapContextProvider>
      </SelectionProvider>
    </GazDataProvider>
  </StrictMode>
);
