import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { GazDataProvider, SelectionProvider } from "@carma-apps/portals";

import App from "./app/App.jsx";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { gazDataConfig } from "./config/gazData.js";

suppressReactCismapErrors();

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
if (typeof global === "undefined") {
  window.global = window;
}
root.render(
  <StrictMode>
    <GazDataProvider config={gazDataConfig}>
      <SelectionProvider>
        <App />
      </SelectionProvider>
    </GazDataProvider>
  </StrictMode>
);
