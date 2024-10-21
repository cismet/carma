// Built-in Modules
import { useEffect } from "react";

// 3rd party Modules
import { ErrorBoundary } from "react-error-boundary";
import { useDispatch, useSelector } from "react-redux";

// 1st party Modules
import { CrossTabCommunicationContextProvider } from "react-cismap/contexts/CrossTabCommunicationContextProvider";

// Monorepo Packages
import { backgroundSettings } from "@carma-collab/wuppertal/geoportal";
import {
  BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma-commons/resources";
import { OverlayTourProvider } from "@carma-commons/ui/lib-helper-overlay";
import { CesiumContextProvider } from "@carma-mapping/cesium-engine";
import type { Layer } from "@carma-mapping/layers";
import type { BackgroundLayer, Settings } from "@carma-apps/portals";

// Local Modules
import AppErrorFallback from "./components/AppErrorFallback";
import { GeoportalMap } from "./components/GeoportalMap/GeoportalMap";
import MapMeasurement from "./components/map-measure/MapMeasurement";
import TopNavbar from "./components/TopNavbar";

import type { AppDispatch } from "./store";

import {
  getUIAllowChanges,
  getUIOverlayTourMode,
  toggleShowOverlayTour,
  setUIShowLayerHideButtons,
  getSyncToken,
} from "./store/slices/ui";

// Side-Effect Imports
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "./index.css";

if (typeof global === "undefined") {
  window.global = window;
}

export type AppConfig = {
  layers: Layer[];
  backgroundLayer: BackgroundLayer;
  settings?: Settings;
};

function App() {
  const dispatch: AppDispatch = useDispatch();
  const tourMode = useSelector(getUIOverlayTourMode);
  const allowUiChanges = useSelector(getUIAllowChanges);
  const syncToken = useSelector(getSyncToken);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) {
        dispatch(setUIShowLayerHideButtons(true));
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (allowUiChanges) {
        dispatch(setUIShowLayerHideButtons(false));
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onKeyUp);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onKeyUp);
    };
  }, [allowUiChanges, dispatch]);

  const content = (
    <OverlayTourProvider
      showOverlay={tourMode}
      closeOverlay={() => dispatch(toggleShowOverlayTour(false))}
      transparency={backgroundSettings.transparency}
      color={backgroundSettings.color}
    >
      <CesiumContextProvider
        //initialViewerState={defaultCesiumState}
        // TODO move these to store/slice setup ?
        providerConfig={{
          surfaceProvider: WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
          terrainProvider: WUPP_TERRAIN_PROVIDER,
          imageryProvider: BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
        }}
      >
        <ErrorBoundary FallbackComponent={AppErrorFallback}>
          <div className="flex flex-col w-full " style={{ height: "100dvh" }}>
            <TopNavbar />
            <MapMeasurement />
            <GeoportalMap />
          </div>
        </ErrorBoundary>
      </CesiumContextProvider>
    </OverlayTourProvider>
  );

  console.info("RENDER: [GEOPORTAL] APP");

  return syncToken ? (
    <CrossTabCommunicationContextProvider role="sync" token={syncToken}>
      {content}
    </CrossTabCommunicationContextProvider>
  ) : (
    content
  );
}

export default App;
