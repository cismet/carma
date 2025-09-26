import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import {
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";
import App from "./app/App.jsx";
import { gazDataConfig } from "./config/gazData.js";
import { suppressReactCismapErrors } from "@carma-commons/utils";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
suppressReactCismapErrors();

root.render(
  <StrictMode>
    <GazDataProvider config={gazDataConfig}>
      <SelectionProvider>
        <App />
      </SelectionProvider>
    </GazDataProvider>
  </StrictMode>
);
