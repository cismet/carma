import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider, createHashRouter } from "react-router-dom";
import { persistStore } from "redux-persist";
import { PersistGate } from "redux-persist/integration/react";

import { TweakpaneProvider } from "@carma-commons/debug";
import { suppressReactCismapErrors } from "@carma-commons/utils";

import App from "./app/App";
import store from "./app/store";
import { CESIUM_CONFIG } from "./app/config/app.config";

declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}

const persistor = persistStore(store);

suppressReactCismapErrors();

window.CESIUM_BASE_URL = CESIUM_CONFIG.baseUrl;

console.info("RENDER: [GEOPORTAL] ROOT");

const root = createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <PersistGate loading={null} persistor={persistor}>
    <Provider store={store}>
      <TweakpaneProvider>
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
      </TweakpaneProvider>
    </Provider>
  </PersistGate>,
);
