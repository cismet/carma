// Built-in Modules
import { useContext, useEffect, useState } from "react";

// 3rd party Modules
import LZString from "lz-string";
import { ErrorBoundary } from "react-error-boundary";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useSearchParams } from "react-router-dom";

// 1st party Modules
import { CrossTabCommunicationContextProvider } from "react-cismap/contexts/CrossTabCommunicationContextProvider";

// Monorepo Packages
import { backgroundSettings } from "@carma-collab/wuppertal/geoportal";

import {
  CarmaMapContextProvider,
  type BackgroundLayer,
  type Settings,
} from "@carma-apps/portals";
import type { Layer } from "@carma-mapping/layers";

// Local Modules
import AppErrorFallback from "./components/AppErrorFallback";
import { GeoportalMap } from "./components/GeoportalMap/GeoportalMap";
import MapMeasurement from "./components/map-measure/MapMeasurement";
import TopNavbar from "./components/TopNavbar";

import type { AppDispatch } from "./store";
import {
  getBackgroundLayer,
  getSelectedMapLayer,
  setBackgroundLayer,
  setLayers,
  setSelectedMapLayer,
  setShowFullscreenButton,
  setShowHamburgerMenu,
  setShowLocatorButton,
  setShowMeasurementButton,
} from "./store/slices/mapping";
import {
  getUIAllowChanges,
  getUIMode,
  setUIAllowChanges,
  setUIMode,
  setUIShowLayerButtons,
  setUIShowLayerHideButtons,
} from "./store/slices/ui";

import { layerMap } from "./config";
import { CESIUM_CONFIG } from "./config/app.config";

// Side-Effect Imports
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "./index.css";
import { changeIfPopupOpend, getIfPopupOpend } from "./store/slices/print";

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
  const uiMode = useSelector(getUIMode);
  const location = useLocation();
  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedMapLayer = useSelector(getSelectedMapLayer);

  const [syncToken, setSyncToken] = useState(null);
  const ifPopupPrintOpened = useSelector(getIfPopupOpend);

  useEffect(() => {
    console.debug(
      " [GEOPORTAL|ROUTER] App Route changed to:",
      location.pathname
    );
  }, [location]);

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
        dispatch(setUIShowLayerButtons(newConfig.settings.showLayerButtons));
        dispatch(setShowFullscreenButton(newConfig.settings.showFullscreen));
        dispatch(setShowLocatorButton(newConfig.settings.showLocator));
        dispatch(setShowMeasurementButton(newConfig.settings.showMeasurement));
        dispatch(setShowHamburgerMenu(newConfig.settings.showHamburgerMenu));

        if (newConfig.settings.showLayerHideButtons || published) {
          dispatch(setUIAllowChanges(false));
          dispatch(setUIShowLayerHideButtons(true));
        } else {
          dispatch(setUIAllowChanges(true));
          dispatch(setUIShowLayerHideButtons(false));
        }
      }
      searchParams.delete("data");
      setSearchParams(searchParams);
    }
  }, [searchParams]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) {
        dispatch(setUIShowLayerHideButtons(true));
      }

      // if (e.key === "Escape") {
      //   if (uiMode === "print" && !ifPopupPrintOpened) {
      //     dispatch(setUIMode("default"));
      //   }
      //   dispatch(changeIfPopupOpend(false));
      // }
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
  }, [allowUiChanges]);

  useEffect(() => {
    const backgroundLayerId = backgroundLayer.id;
    const selectedMapLayerId = selectedMapLayer.id;

    const getId = () => {
      return backgroundLayerId === "luftbild"
        ? backgroundLayerId
        : selectedMapLayerId;
    };
    dispatch(
      setBackgroundLayer({
        title: layerMap[getId()].title,
        id: backgroundLayerId,
        opacity: 1.0,
        description: layerMap[getId()].description,
        inhalt: layerMap[getId()].inhalt,
        eignung: layerMap[getId()].eignung,
        visible: backgroundLayer.visible,
        layerType: "wmts",
        props: {
          name: "",
          url: layerMap[getId()].url,
        },
        layers: layerMap[getId()].layers,
      })
    );

    dispatch(
      setSelectedMapLayer({
        title: layerMap[selectedMapLayerId].title,
        id: selectedMapLayerId,
        opacity: 1.0,
        description: ``,
        inhalt: layerMap[selectedMapLayerId].inhalt,
        eignung: layerMap[selectedMapLayerId].eignung,
        visible: selectedMapLayer.visible,
        layerType: "wmts",
        props: {
          name: "",
          url: layerMap[selectedMapLayerId].url,
        },
        layers: layerMap[selectedMapLayerId].layers,
      })
    );
  }, []);

  const content = (
    <CarmaMapContextProvider
      cesiumOptions={CESIUM_CONFIG}
      overlayOptions={{
        background: backgroundSettings,
      }}
    >
      <ErrorBoundary FallbackComponent={AppErrorFallback}>
        <div className="flex flex-col w-full " style={{ height: "100dvh" }}>
          {!published && <TopNavbar />}
          <MapMeasurement />
          <GeoportalMap />
        </div>
      </ErrorBoundary>
    </CarmaMapContextProvider>
  );

  console.debug("RENDER: [GEOPORTAL] APP");

  return syncToken ? (
    <CrossTabCommunicationContextProvider role="sync" token={syncToken}>
      {content}
    </CrossTabCommunicationContextProvider>
  ) : (
    content
  );
}

export default App;
