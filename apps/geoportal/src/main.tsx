import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider, createHashRouter } from "react-router-dom";
import { persistStore } from "redux-persist";
import { PersistGate } from "redux-persist/integration/react";

import { AdhocFeatureDisplayProvider } from "@carma-appframeworks/portals";
import { carma } from "@carma-api";
import { preventPinchZoom } from "@carma-commons/dom/window";
import { cjsGlobalShim, suppressReactCismapErrors } from "@carma-commons/utils";
import { setupCesiumEnvironment } from "@carma-mapping/engines/cesium/core";
import { ImageList, ServiceList } from "@carma-mapping/layers";

import { CESIUM_CONFIG } from "./app/config/app.config";
import App from "./app/App";
import store from "./app/store";
import { apiUrl } from "./app/constants/discover";

cjsGlobalShim();
// Set up Cesium environment (CESIUM_BASE_URL) via engine helper
setupCesiumEnvironment(CESIUM_CONFIG);

if (import.meta.env.DEV) {
  window.carma = carma;
}

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
            {
              path: "/about/images.md",
              element: <ImageList markdown />,
            },
            {
              path: "/about/services",
              element: (
                <ServiceList
                  discoverProps={{
                    appKey: "Geoportal.Online.Wuppertal",
                    apiUrl: apiUrl,
                    daqKey: "gp_entdecken",
                  }}
                />
              ),
            },
            {
              path: "/about/services.md",
              element: (
                <ServiceList
                  discoverProps={{
                    appKey: "Geoportal.Online.Wuppertal",
                    apiUrl: apiUrl,
                    daqKey: "gp_entdecken",
                  }}
                  markdown
                />
              ),
            },
          ])}
        />
      </AdhocFeatureDisplayProvider>
    </PersistGate>
  </Provider>
);
