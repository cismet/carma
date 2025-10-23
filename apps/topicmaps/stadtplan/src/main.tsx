import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import {
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";

import App from "./app/App.jsx";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { gazDataConfig } from "./config/gazData.js";
import { cjsGlobalShim } from "@carma-commons/utils/window";

suppressReactCismapErrors();
cjsGlobalShim();

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <StrictMode>
    <GazDataProvider config={gazDataConfig}>
      <SelectionProvider>
        <App />
      </SelectionProvider>
    </GazDataProvider>
  </StrictMode>
);
