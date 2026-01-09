import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "./styles.css";
import { cjsGlobalShim } from "@carma-commons/utils";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

cjsGlobalShim();

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
