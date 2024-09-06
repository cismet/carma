import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "./index.css";
import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";
import { GeoportalMap } from "./components/GeoportalMap";
import TopNavbar from "./components/TopNavbar";
import MapMeasurement from "./components/map-measure/MapMeasurement";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import LZString from "lz-string";
import { useDispatch, useSelector } from "react-redux";
import { backgroundSettings } from "@carma-collab/wuppertal/geoportal";
import {
  setBackgroundLayer,
  setLayers,
  setShowFullscreenButton,
  setShowHamburgerMenu,
  setShowLocatorButton,
  setShowMeasurementButton,
} from "./store/slices/mapping";
import {
  getAllowUiChanges,
  getMode,
  setAllow3d,
  setAllowUiChanges,
  setMode,
  setShowLayerButtons,
  setShowLayerHideButtons,
} from "./store/slices/ui";
import { Layer } from "@carma-mapping/layers";
import { CrossTabCommunicationContextProvider } from "react-cismap/contexts/CrossTabCommunicationContextProvider";
import HomeButton from "./components/HomeButton";
import type { BackgroundLayer, Settings } from "@carma-apps/portals";
import { OverlayTourProvider } from "@carma/libraries/commons/ui/lib-helper-overlay";
import { BASEMAP_METROPOLRUHR_WMS_GRAUBLAU, WUPP_TERRAIN_PROVIDER } from "./config/dataSources.config";
import { MODEL_ASSETS } from "./config/assets.config";
import { CustomViewerContextProvider } from "@carma-mapping/cesium-engine";

if (typeof global === "undefined") {
  window.global = window;
}

type Config = {
  layers: Layer[];
  backgroundLayer: BackgroundLayer;
  settings?: Settings;
};

function App({ published }: { published?: boolean }) {
  const [syncToken, setSyncToken] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const allowUiChanges = useSelector(getAllowUiChanges);
  const dispatch = useDispatch();
  const mode = useSelector(getMode);

  useEffect(() => {
    // TODO: remove if feature flag is removed

    dispatch(setAllow3d(searchParams.has("allow3d")));

    // END FEATURE FLAG

    if (searchParams.get("sync")) {
      setSyncToken(searchParams.get("sync"));
    }

    if (searchParams.get("data")) {
      const data = searchParams.get("data");
      const newConfig: Config = JSON.parse(
        LZString.decompressFromEncodedURIComponent(data),
      );
      dispatch(setLayers(newConfig.layers));
      dispatch(setBackgroundLayer(newConfig.backgroundLayer));
      if (newConfig.settings) {
        dispatch(setShowLayerButtons(newConfig.settings.showLayerButtons));
        dispatch(setShowFullscreenButton(newConfig.settings.showFullscreen));
        dispatch(setShowLocatorButton(newConfig.settings.showLocator));
        dispatch(setShowMeasurementButton(newConfig.settings.showMeasurement));
        dispatch(setShowHamburgerMenu(newConfig.settings.showHamburgerMenu));

        if (newConfig.settings.showLayerHideButtons || published) {
          dispatch(setAllowUiChanges(false));
          dispatch(setShowLayerHideButtons(true));
        } else {
          dispatch(setAllowUiChanges(true));
          dispatch(setShowLayerHideButtons(false));
        }
      }
      searchParams.delete("data");
      setSearchParams(searchParams);
    }
  }, [searchParams]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) {
        dispatch(setShowLayerHideButtons(true));
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (allowUiChanges) {
        dispatch(setShowLayerHideButtons(false));
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

  const content = (
    <OverlayTourProvider
      showOverlay={mode === "tour" ? true : false}
      closeOverlay={() => dispatch(setMode("default"))}
      transparency={backgroundSettings.transparency}
      color={backgroundSettings.color}
    >
      <TopicMapContextProvider>
        <CustomViewerContextProvider
          //initialViewerState={defaultCesiumState}
          // TODO move these to store/slice setup ?
          providerConfig={{
            terrainProvider: WUPP_TERRAIN_PROVIDER,
            imageryProvider: BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
            models: MODEL_ASSETS,
          }}
        >
          <div className="flex flex-col h-screen w-full">
            {!published && <TopNavbar />}
            <MapMeasurement />
            <GeoportalMap />
          </div>
        </CustomViewerContextProvider>
      </TopicMapContextProvider>
    </OverlayTourProvider>
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
