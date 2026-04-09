import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import {
  SelectionProvider,
  GazDataProvider,
} from "@carma-appframeworks/portals";
import { SandboxedEvalProvider } from "@carma-commons/sandbox-eval";
import { LibreContextProvider } from "@carma-mapping/engines/maplibre";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { defaultGazDataConfig } from "@carma-commons/resources";
import { cjsGlobalShim } from "@carma-commons/utils";
import App from "./app/App";

cjsGlobalShim();

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <StrictMode>
    <SandboxedEvalProvider>
      <TopicMapContextProvider infoBoxPixelWidth={350}>
        <GazDataProvider config={defaultGazDataConfig}>
          <SelectionProvider>
            <LibreContextProvider>
              <App />
            </LibreContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </TopicMapContextProvider>
    </SandboxedEvalProvider>
  </StrictMode>
);
