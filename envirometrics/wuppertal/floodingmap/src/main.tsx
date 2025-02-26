import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";

import { Provider } from "react-redux";
import { persistStore } from "redux-persist";
import { PersistGate } from "redux-persist/integration/react";

import { MappingConstants } from "react-cismap";
import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";
import { CrossTabCommunicationContextProvider } from "react-cismap/contexts/CrossTabCommunicationContextProvider";

import { GazDataProvider, SelectionProvider } from "@carma-apps/portals";
import { TweakpaneProvider } from "@carma-commons/debug";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import {
  CesiumContextProvider,
  setupCesiumEnvironment,
} from "@carma-mapping/cesium-engine";

import App from "./App";
import store from "./store";
import { gazDataConfig } from "./config/gazData";
import { SYNC_TOKEN } from "./config/app.config";
import { CESIUM_CONFIG } from "./config/cesium/cesium.config";

suppressReactCismapErrors();
setupCesiumEnvironment();

const persistor = persistStore(store);

const enableSync = true;

const syncedApp = (
  <CrossTabCommunicationContextProvider role="sync" token={SYNC_TOKEN}>
    <App sync={true} />
  </CrossTabCommunicationContextProvider>
);

const appWithContext = (
  <GazDataProvider config={gazDataConfig}>
    <SelectionProvider>
      <TopicMapContextProvider
        appKey={"Hochwasserkarte.Story.Wuppertal"}
        //referenceSystem={MappingConstants.crs3857}
        //referenceSystemDefinition={MappingConstants.proj4crs3857def}
        // baseLayerConf={wuppertalConfig.overridingBaseLayerConf}
        infoBoxPixelWidth={370}
      >
        <CesiumContextProvider
          providerConfig={CESIUM_CONFIG.providerConfig}
          tilesetConfigs={CESIUM_CONFIG.tilesetConfigs}
        >
          {enableSync ? syncedApp : <App />}
        </CesiumContextProvider>
      </TopicMapContextProvider>
    </SelectionProvider>
  </GazDataProvider>
);

const router = createHashRouter([
  {
    path: "/",
    element: appWithContext,
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
