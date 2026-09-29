import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import {
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { NonLiveBorder } from "@carma-commons/ui/components";
import App from "./app/App";
import { APP_CONFIG } from "./config/appConfig";
import { gazDataConfig } from "./config/gazData";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
suppressReactCismapErrors();

document.getElementById("splash-loading")?.remove();
root.render(
  <StrictMode>
    <NonLiveBorder visible={!APP_CONFIG.isLiveDatabase} />
    <GazDataProvider config={gazDataConfig}>
      <SelectionProvider>
        <App />
      </SelectionProvider>
    </GazDataProvider>
  </StrictMode>
);
