import { useEffect, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider, useDispatch } from "react-redux";
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
import {
  STORE_APP_KEY,
  clearAppKeyReloadMarker,
  readAppKeyReloadMarker,
  resolveAppKey,
  writeAppKeyReloadMarker,
} from "./app/store/app-key";
import {
  setUIHashWriteEnabled,
  setUIMapInteractionEnabled,
  setUIVisibleControls,
} from "./app/store/slices/ui";
import { discoverProps } from "./app/constants/discover";
import {
  fachzwillingRoutes,
  findFachzwillingByPathname,
  getFachzwillingCatalogConfig,
  getGeoportalCategoryDefinitions,
  resolveFachzwillingUi,
} from "./app/constants/fachzwillinge";

/**
 * One persistent App instance for the default and all Fachzwilling routes:
 * the catalog config and category registry follow the location reactively, so
 * navigating between the routes only swaps the active filters and the route's
 * workflows instead of remounting the app (map, providers and the open catalog
 * modal stay alive).
 */
const RoutedApp = () => {
  const dispatch = useDispatch();
  const { pathname } = useLocation();
  const fachzwilling = useMemo(
    () => findFachzwillingByPathname(pathname),
    [pathname]
  );

  /**
   * A route with a storage namespace of its own cannot be served by a store
   * that was built for another one: redux-persist takes its keys once, at
   * construction, and the hash router switches route without rebuilding the
   * store. The new route would then read and write the previous route's
   * records, which is the leak the namespaces exist to close. So the switch
   * becomes a real page load, which the map position survives because it
   * travels in the hash.
   *
   * The reload is fired at most once per mismatch. It relies on the router's
   * pathname and the hash the store was built from naming the same route, and
   * a case where they disagree permanently would otherwise reload forever and
   * leave the app unusable. Both halves of the marker are stable across such a
   * reload, so a second arrival at the same mismatch is the loop, and the app
   * then stays up on the wrong namespace with an error rather than spinning.
   */
  useEffect(() => {
    if (resolveAppKey(pathname) === STORE_APP_KEY) {
      clearAppKeyReloadMarker();
      return;
    }
    const marker = `${pathname}|${STORE_APP_KEY ?? ""}`;
    if (readAppKeyReloadMarker() === marker) {
      console.error(
        `[STORE] reloading for "${pathname}" did not reach its storage ` +
          `namespace (still "${STORE_APP_KEY ?? "app-wide"}"); staying put ` +
          "instead of reloading again. The route's path and the hash the " +
          "store reads have to resolve to the same key."
      );
      return;
    }
    writeAppKeyReloadMarker(marker);
    window.location.reload();
  }, [pathname]);

  useEffect(() => {
    dispatch(setUIVisibleControls(resolveFachzwillingUi(fachzwilling?.ui)));
    dispatch(setUIMapInteractionEnabled(!fachzwilling?.disableMapInteraction));
    dispatch(setUIHashWriteEnabled(!fachzwilling?.disableHashWrite));
  }, [dispatch, fachzwilling]);

  const catalogConfig = useMemo(
    () =>
      fachzwilling ? getFachzwillingCatalogConfig(fachzwilling) : undefined,
    [fachzwilling]
  );
  const categories = useMemo(
    () => getGeoportalCategoryDefinitions(fachzwilling?.perspectives),
    [fachzwilling]
  );
  return (
    <App
      catalogConfig={catalogConfig}
      categories={categories}
      addons={fachzwilling?.addons}
      routePath={fachzwilling ? `/${fachzwilling.path}` : "/"}
    />
  );
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

/**
 * Vite's React plugin treats this export-less entry as a Fast Refresh
 * boundary, so a hot update that bubbles up here re-executes the module in
 * place instead of reloading the page. A second `createRoot()` on the same
 * container would then render a parallel tree over the old one, which ends in
 * `removeChild` errors while the old map tears down. Reuse the root instead.
 */
type HotRootData = { root?: Root };
const hotRootData = import.meta.hot?.data as HotRootData | undefined;
const root =
  hotRootData?.root ??
  createRoot(document.getElementById("root") as HTMLElement);
if (hotRootData) hotRootData.root = root;

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
              element: <ServiceList discoverProps={discoverProps} markdown />,
            },
          ])}
        />
      </AdhocFeatureDisplayProvider>
    </PersistGate>
  </Provider>
);
