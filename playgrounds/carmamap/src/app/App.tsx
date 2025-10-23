// Built-in Modules
import { useEffect, useState } from "react";

// 3rd party Modules
import LZString from "lz-string";
import { ErrorBoundary } from "react-error-boundary";
// TODO: Remove Redux usage - using library pattern instead
// import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";

// 1st party Modules
import { CrossTabCommunicationContextProvider } from "react-cismap/contexts/CrossTabCommunicationContextProvider";

// Monorepo Packages
import { backgroundSettings } from "@carma-collab/wuppertal/geoportal";

import {
  CarmaMapProviderWrapper,
  type Settings,
  type PortalConfig,
} from "@carma-appframeworks/portals";
import type { BackgroundLayer, Layer } from "@carma/types";

// Local Modules
import AppErrorFallback from "./components/AppErrorFallback";
import { CarmaMap } from "./components/CarmaMap/CarmaMap";

// TODO: Remove Redux store references - using library pattern instead
// import type { AppDispatch } from "./store";
// import {
//   setBackgroundLayer,
//   setLayers,
//   setShowFullscreenButton,
//   setShowLocatorButton,
// } from "./store/slices/mapping";
// import { getUIAllowChanges } from "./store/slices/ui";

import {
  CESIUM_CONFIG,
  DEFAULT_MAP_POSITION,
  DEFAULT_CESIUM_CAMERA,
  LEAFLET_CONFIG,
} from "./config/app.config";
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
  // TODO: Remove Redux usage - using library pattern instead
  // const dispatch: AppDispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  // TODO: Replace with library pattern
  // const allowUiChanges = useSelector(getUIAllowChanges);

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
      // TODO: Replace Redux dispatch usage with library pattern
      // dispatch(setLayers(newConfig.layers));
      // dispatch(setBackgroundLayer(newConfig.backgroundLayer));
      if (newConfig.settings) {
        // TODO: Replace Redux dispatch usage with library pattern
        // dispatch(setShowFullscreenButton(newConfig.settings.showFullscreen));
        // dispatch(setShowLocatorButton(newConfig.settings.showLocator));
      }
      searchParams.delete("data");
      setSearchParams(searchParams);
    }
  }, [searchParams]);

  const portalConfig: PortalConfig = {
    hashConfig: [], // Will use default hash config
    styleConfig: carmaMapStyleConfig,
    homePosition: DEFAULT_MAP_POSITION,
    homePose3d: DEFAULT_CESIUM_CAMERA,
    defaultPosition: DEFAULT_MAP_POSITION,
    defaultCameraLocation: DEFAULT_CESIUM_CAMERA,
    cesiumConfig: CESIUM_CONFIG,
    leafletConfig: LEAFLET_CONFIG,
    overlayConfig: {
      transparency: backgroundSettings.transparency,
      color: backgroundSettings.color,
    },
  };

  const content = (
    <CarmaMapProviderWrapper portalConfig={portalConfig}>
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
