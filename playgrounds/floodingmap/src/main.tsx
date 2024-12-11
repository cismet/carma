import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";

import { Provider } from "react-redux";
import { persistStore } from "redux-persist";
import { PersistGate } from "redux-persist/integration/react";

import { TweakpaneProvider } from "@carma-commons/debug";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { setupCesiumEnvironment } from "@carma-mapping/cesium-engine";

import App from "./App";
import store from "./store";

suppressReactCismapErrors();
setupCesiumEnvironment();

const persistor = persistStore(store);

const router = createHashRouter([
  {
    path: "/",
    element: <App />,
  },
]);
const root = createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <Provider store={store}>
    <TweakpaneProvider>
      <PersistGate loading={null} persistor={persistor}>
        <RouterProvider router={router} />
      </PersistGate>
    </TweakpaneProvider>
  </Provider>
);
