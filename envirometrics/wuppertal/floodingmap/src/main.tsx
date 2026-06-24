import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";

import { CrossTabCommunicationContextProvider } from "react-cismap/contexts/CrossTabCommunicationContextProvider";
import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";

import {
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";
import {
  getHashParams,
  HASH_LAUNCH_MODE,
  resolveHashLaunchMode,
} from "@carma-commons/utils";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import {
  CARMA_MAP_FRAMEWORKS,
  MapFrameworkSwitcherProvider,
  type CarmaMapFramework,
} from "@carma-mapping/components";
import { CesiumContextProvider } from "@carma-mapping/engines/cesium/react/runtime";
import { setupCesiumEnvironment } from "@carma-mapping/engines/cesium/core";
import { HashStateProvider } from "@carma-providers/hash-state";

import App from "./App";
import { SYNC_TOKEN } from "./config/app.config";
import { CESIUM_CONFIG } from "./config/cesium/cesium.config";
import { defaultCesiumState } from "./config/cesium/store.config";
import { gazDataConfig } from "./config/gazData";
import {
  FLOODINGMAP_HASH_PARAM_NAME_ORDER,
  FLOODINGMAP_STATE_KEY_TO_HASH_PARAM_VALUE_CODEC_MAP,
} from "./config/hash-state.config";
suppressReactCismapErrors();
setupCesiumEnvironment(CESIUM_CONFIG);

const enableSync = true;

const readInitialFrameworkFromHash = (): CarmaMapFramework => {
  const mode = resolveHashLaunchMode(getHashParams(), {
    defaultMode: HASH_LAUNCH_MODE.THREE_D,
  });

  return mode === HASH_LAUNCH_MODE.TWO_D
    ? CARMA_MAP_FRAMEWORKS.LEAFLET
    : CARMA_MAP_FRAMEWORKS.CESIUM;
};

const initialFramework = readInitialFrameworkFromHash();

const syncedApp = (
  <CrossTabCommunicationContextProvider role="sync" token={SYNC_TOKEN}>
    <App sync={true} />
  </CrossTabCommunicationContextProvider>
);

const appWithContext = (
  <HashStateProvider
    stateKeyToHashParamValueCodecMap={
      FLOODINGMAP_STATE_KEY_TO_HASH_PARAM_VALUE_CODEC_MAP
    }
    hashParamNameOrder={FLOODINGMAP_HASH_PARAM_NAME_ORDER}
  >
    <GazDataProvider config={gazDataConfig}>
      <SelectionProvider>
        <TopicMapContextProvider
          appKey={"Hochwasserkarte.Story.Wuppertal"}
          //referenceSystem={MappingConstants.crs3857}
          //referenceSystemDefinition={MappingConstants.proj4crs3857def}
          // baseLayerConf={wuppertalConfig.overridingBaseLayerConf}
          infoBoxPixelWidth={370}
        >
          <MapFrameworkSwitcherProvider initialFramework={initialFramework}>
            <CesiumContextProvider
              providerConfig={CESIUM_CONFIG.providerConfig}
              tilesetConfigs={CESIUM_CONFIG.tilesetConfigs}
              defaultRuntimeState={defaultCesiumState}
            >
              {enableSync ? syncedApp : <App />}
            </CesiumContextProvider>
          </MapFrameworkSwitcherProvider>
        </TopicMapContextProvider>
      </SelectionProvider>
    </GazDataProvider>
  </HashStateProvider>
);

const router = createHashRouter([
  {
    path: "/",
    element: appWithContext,
  },
]);
const root = createRoot(document.getElementById("root") as HTMLElement);

root.render(<RouterProvider router={router} />);
