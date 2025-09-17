import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { CESIUM_BASE_URL } from "./app/config/app.config";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { Provider } from "react-redux";
import { setupStore } from "./app/store";
import defaultViewerState from "./app/config";
import { setupCesiumEnvironment } from "@carma-mapping/engines/cesium";

suppressReactCismapErrors();

setupCesiumEnvironment({ baseUrl: CESIUM_BASE_URL });
const root = createRoot(document.getElementById("root") as HTMLElement);

const store = setupStore(defaultViewerState);

root.render(
  <Provider store={store}>
    <App />
  </Provider>
);
