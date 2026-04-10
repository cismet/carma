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

const backgroundConfigurations = {
  lbk: {
    layerkey: "rvrGrundriss@100|trueOrtho2024@75|rvrSchriftNT@100",
    src: "/images/rain-hazard-map-bg/ortho.png",
    title: "Luftbildkarte",
  },
  stadtplan: {
    layerkey: "amtlich@90",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <StrictMode>
    <SandboxedEvalProvider>
      <TopicMapContextProvider
        infoBoxPixelWidth={350}
        backgroundConfigurations={backgroundConfigurations}
      >
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
