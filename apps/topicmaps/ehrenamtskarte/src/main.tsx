import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { GazDataProvider } from "@carma-providers/gaz-data";
import { SelectionProvider } from "@carma-providers/selection";
import App from "./app/App.jsx";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
if (typeof global === "undefined") {
  window.global = window;
}
root.render(
  <StrictMode>
    <GazDataProvider>
      <SelectionProvider>
        <App />
      </SelectionProvider>
    </GazDataProvider>
  </StrictMode>
);
