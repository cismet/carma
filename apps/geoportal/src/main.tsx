import { useMemo } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import {
  RouterProvider,
  createHashRouter,
  useLocation,
} from "react-router-dom";
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
import { discoverProps } from "./app/constants/discover";
import {
  fachzwillingRoutes,
  findFachzwillingByPathname,
  getFachzwillingCatalogConfig,
} from "./app/constants/fachzwillinge";

/**
 * One persistent App instance for the default and all Fachzwilling routes:
 * the catalog config follows the location reactively, so navigating between
 * the routes only swaps the active filters instead of remounting the app
 * (map, providers and the open catalog modal stay alive).
 */
const RoutedApp = () => {
  const { pathname } = useLocation();
  const catalogConfig = useMemo(() => {
    const fachzwilling = findFachzwillingByPathname(pathname);
    return fachzwilling
      ? getFachzwillingCatalogConfig(fachzwilling)
      : undefined;
  }, [pathname]);
  return <App catalogConfig={catalogConfig} />;
};

const routedApp = <RoutedApp />;

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
              element: routedApp,
            },
            {
              path: "/publish",
              element: <App published={true} />,
            },
            ...fachzwillingRoutes.map((route) => ({
              path: `/${route.path}`,
              element: routedApp,
            })),
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
              element: <ServiceList discoverProps={discoverProps} />,
            },
            {
              path: "/about/services.md",
              element: (
                <ServiceList discoverProps={discoverProps} markdown />
              ),
            },
          ])}
        />
      </AdhocFeatureDisplayProvider>
    </PersistGate>
  </Provider>
);
