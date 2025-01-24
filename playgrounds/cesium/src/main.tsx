import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { CESIUM_BASE_URL } from "./app/config/app.config";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { Provider } from "react-redux";
import { setupStore } from "./app/store";
import defaultViewerState from "./app/config";
import { TweakpaneProvider } from "@carma-commons/debug";
import { CesiumContextProvider } from "@carma-mapping/cesium-engine";
import {
  BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
  WUPP_LOD2_TILESET,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
} from "@carma-commons/resources";
declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}

suppressReactCismapErrors();

window.CESIUM_BASE_URL = CESIUM_BASE_URL;
const root = createRoot(document.getElementById("root") as HTMLElement);

const store = setupStore(defaultViewerState);

root.render(
  <Provider store={store}>
    <CesiumContextProvider
      //initialViewerState={defaultViewerState}
      providerConfig={{
        terrainProvider: WUPP_TERRAIN_PROVIDER,
        imageryProvider: BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
      }}
      tilesetConfigs={{
        primary: WUPP_MESH_2024,
        secondary: WUPP_LOD2_TILESET,
      }}
    >
      <TweakpaneProvider>
        <App />
      </TweakpaneProvider>
    </CesiumContextProvider>
  </Provider>
);
