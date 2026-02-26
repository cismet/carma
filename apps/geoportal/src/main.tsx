import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider, createHashRouter } from "react-router-dom";
import { persistStore } from "redux-persist";
import { PersistGate } from "redux-persist/integration/react";

import { setupCesiumEnvironment } from "@carma-mapping/engines/cesium";
import {
  suppressReactCismapErrors,
  preventPinchZoom,
  cjsGlobalShim,
} from "@carma-commons/utils";

import App from "./app/App";
import store from "./app/store";
import { CESIUM_CONFIG } from "./app/config/app.config";
import { AdhocFeatureDisplayProvider } from "@carma-appframeworks/portals";
import { ImageList } from "@carma-mapping/layers";

cjsGlobalShim();
// Set up Cesium environment (CESIUM_BASE_URL) via engine helper
setupCesiumEnvironment(CESIUM_CONFIG);

const persistor = persistStore(store);

suppressReactCismapErrors();

preventPinchZoom();

const root = createRoot(document.getElementById("root") as HTMLElement);

document.getElementById("splash-loading")?.remove();

console.debug("RENDER: [GEOPORTAL] ROOT");

root.render(
  <Provider store={store}>
    <PersistGate loading={null} persistor={persistor}>
      <AdhocFeatureDisplayProvider>
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
            {
              path: "/about/images",
              element: <ImageList />,
            },
          ])}
        />
      </AdhocFeatureDisplayProvider>
    </PersistGate>
  </Provider>
);
