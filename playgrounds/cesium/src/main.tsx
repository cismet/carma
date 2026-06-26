import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";

import { suppressReactCismapErrors } from "@carma-commons/utils";
import { setupCesiumEnvironment } from "@carma-mapping/engines/cesium/core";

import { CESIUM_BASE_URL } from "./app/config/app.config";
import { App } from "./app/App";
import { setupStore } from "./app/store";

suppressReactCismapErrors();

setupCesiumEnvironment({ baseUrl: CESIUM_BASE_URL });
const root = createRoot(document.getElementById("root") as HTMLElement);

const store = setupStore();

root.render(
  <Provider store={store}>
    <App />
  </Provider>
);
