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
import { setupCesiumEnvironment } from "@carma-mapping/cesium-engine";

const persistor = persistStore(store);

suppressReactCismapErrors();

setupCesiumEnvironment(CESIUM_CONFIG);

console.debug("RENDER: [CARMAMAP] ROOT");

const root = createRoot(document.getElementById("root") as HTMLElement);

const router = createHashRouter([
  {
    path: "/",
    element: <App />,
  },
]);

root.render(
  <Provider store={store}>
    <TweakpaneProvider>
      <PersistGate loading={null} persistor={persistor}>
        <RouterProvider router={router} />
      </PersistGate>
    </TweakpaneProvider>
  </Provider>
);
