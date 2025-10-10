import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider, createHashRouter } from "react-router-dom";
import { persistStore } from "redux-persist";
import { PersistGate } from "redux-persist/integration/react";
import proj4 from "proj4";

import { setupCesiumEnvironment } from "@carma-mapping/engines/cesium";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { preventPinchZoom, cjsGlobalShim } from "@carma-commons/dom/window";
import { proj4crs25832def, EPSG25832 } from "@carma-commons/geo";

import App from "./app/App";
import store from "./app/store";
import { CESIUM_CONFIG } from "./app/config/app.config";

proj4.defs(EPSG25832, proj4crs25832def);

cjsGlobalShim();
// Set up Cesium environment (CESIUM_BASE_URL) via engine helper
setupCesiumEnvironment(CESIUM_CONFIG);

const persistor = persistStore(store);

suppressReactCismapErrors();

preventPinchZoom();

const root = createRoot(document.getElementById("root") as HTMLElement);

console.debug("RENDER: [GEOPORTAL] ROOT");

root.render(
  <Provider store={store}>
    <PersistGate loading={null} persistor={persistor}>
      <RouterProvider
        router={createHashRouter([
          {
            path: "/",
            element: <App />,
          },
          {
            path: "/publish",
            element: <App published={true} />,
          },
        ])}
      />
    </PersistGate>
  </Provider>
);
