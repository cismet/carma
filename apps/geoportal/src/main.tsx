import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider, createHashRouter } from "react-router-dom";
import { PersistGate } from "redux-persist/integration/react";

import { TweakpaneProvider } from "@carma-commons/debug";
import { suppressReactCismapErrors } from "@carma-commons/utils";

import App from "./app/App";
import configuredStore from "./app/store";
import { CESIUM_CONFIG } from "./app/config/app.config";
import HashHookComponent from "./app/components/HashHookComponent";

declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}

const { store, persistor } = configuredStore;

suppressReactCismapErrors();

window.CESIUM_BASE_URL = CESIUM_CONFIG.baseUrl;

console.info("RENDER: [GEOPORTAL] ROOT");

const root = createRoot(document.getElementById("root") as HTMLElement);

// TODO separating routing from main app workaround until no child components trigger location change on non-essential navigaton
const router = createHashRouter([
  {
    path: "/",
    element: <HashHookComponent published={false} />,
  },
  {
    path: "/publish",
    element: <HashHookComponent published={true} />,
  },
]);

root.render(
  <Provider store={store}>
    <PersistGate loading={null} persistor={persistor}>
      <TweakpaneProvider>
        <RouterProvider router={router} />
        <App />,
      </TweakpaneProvider>
    </PersistGate>
  </Provider>,
);
