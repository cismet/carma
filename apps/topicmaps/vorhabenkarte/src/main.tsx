import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import {
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";
import { SandboxedEvalProvider } from "@carma-commons/sandbox-eval";
import {
  LibreContextProvider,
  MapHighlightProvider,
  MapSelectionProvider,
} from "@carma-mapping/engines/maplibre";
import App from "./app/App";
import { gazDataConfig } from "./config/gazData";
import { cjsGlobalShim, preventPinchZoom } from "@carma-commons/dom/window";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

cjsGlobalShim();
preventPinchZoom();

document.getElementById("splash-loading")?.remove();

root.render(
  <StrictMode>
    <SandboxedEvalProvider>
      <GazDataProvider config={gazDataConfig}>
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
    </SandboxedEvalProvider>
  </StrictMode>
);
