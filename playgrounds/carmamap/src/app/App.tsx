// Built-in Modules
import { useEffect, useState } from "react";

// 3rd party Modules
import LZString from "lz-string";
import { ErrorBoundary } from "react-error-boundary";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";

// 1st party Modules
import { CrossTabCommunicationContextProvider } from "react-cismap/contexts/CrossTabCommunicationContextProvider";

// Monorepo Packages
import { backgroundSettings } from "@carma-collab/wuppertal/geoportal";

import { CarmaMapProviderWrapper, type Settings } from "@carma-apps/portals";
import type { BackgroundLayer, Layer } from "@carma-commons/types";

// Local Modules
import AppErrorFallback from "./components/AppErrorFallback";
import { CarmaMap } from "./components/CarmaMap/CarmaMap";

import type { AppDispatch } from "./store";
import {
  setBackgroundLayer,
  setLayers,
  setShowFullscreenButton,
  setShowLocatorButton,
} from "./store/slices/mapping";
import { getUIAllowChanges } from "./store/slices/ui";

import { CESIUM_CONFIG } from "./config/app.config";
import { carmaMapStyleConfig } from "./config/mapStyleConfig";

// Side-Effect Imports
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "./index.css";

if (typeof global === "undefined") {
  window.global = window;
}

type Config = {
  layers: Layer[];
  backgroundLayer: BackgroundLayer;
  settings?: Settings;
};

function App({ published }: { published?: boolean }) {
  const dispatch: AppDispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const allowUiChanges = useSelector(getUIAllowChanges);

  const [syncToken, setSyncToken] = useState(null);

  useEffect(() => {
    if (searchParams.get("sync")) {
      setSyncToken(searchParams.get("sync"));
    }

    if (searchParams.get("data")) {
      const data = searchParams.get("data");
      const newConfig: Config = JSON.parse(
        LZString.decompressFromEncodedURIComponent(data)
      );
      dispatch(setLayers(newConfig.layers));
      dispatch(setBackgroundLayer(newConfig.backgroundLayer));
      if (newConfig.settings) {
        dispatch(setShowFullscreenButton(newConfig.settings.showFullscreen));
        dispatch(setShowLocatorButton(newConfig.settings.showLocator));
      }
      searchParams.delete("data");
      setSearchParams(searchParams);
    }
  }, [searchParams]);

  const content = (
    <CarmaMapProviderWrapper
      cesiumOptions={CESIUM_CONFIG}
      overlayOptions={{
        background: backgroundSettings,
      }}
      mapStyleConfig={carmaMapStyleConfig}
    >
      <ErrorBoundary FallbackComponent={AppErrorFallback}>
        <div className="flex flex-col w-full " style={{ height: "100dvh" }}>
          <CarmaMap />
        </div>
      </ErrorBoundary>
    </CarmaMapProviderWrapper>
  );

  return syncToken ? (
    <CrossTabCommunicationContextProvider role="sync" token={syncToken}>
      {content}
    </CrossTabCommunicationContextProvider>
  ) : (
    content
  );
}

export default App;
