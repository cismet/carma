import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";
import { GazDataProvider, SelectionProvider } from "@carma-apps/portals";
import { gazDataConfig } from "./config/gazData";

ReactDOM.render(
  <React.StrictMode>
    <GazDataProvider config={gazDataConfig}>
      <SelectionProvider>
        <App />
      </SelectionProvider>
    </GazDataProvider>
  </React.StrictMode>,
  document.getElementById("root")
);
