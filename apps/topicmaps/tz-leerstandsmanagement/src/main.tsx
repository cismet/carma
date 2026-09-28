import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import {
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import App from "./app/App";
import { gazDataConfig } from "./config/gazData";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
suppressReactCismapErrors();

document.getElementById("splash-loading")?.remove();
root.render(
  <StrictMode>
    <GazDataProvider config={gazDataConfig}>
      <SelectionProvider>
        <App />
      </SelectionProvider>
    </GazDataProvider>
  </StrictMode>
);
