import 'bootstrap/dist/css/bootstrap.min.css';
import 'leaflet/dist/leaflet.css';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import 'react-cismap/topicMaps.css';
import './index.css';
import TopicMapContextProvider from 'react-cismap/contexts/TopicMapContextProvider';
import { Map, TopNavbar, MapMeasurement, HomeButton, sliceMapping, sliceUI } from "@carma-apps/portals"
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import LZString from 'lz-string';
import { useDispatch, useSelector } from 'react-redux';

import { Layer } from '@carma-mapping/layers';
import { host } from "./helper/constants";
import type { Settings } from "@carma-apps/portals";
import CrossTabCommunicationContextProvider from 'react-cismap/contexts/CrossTabCommunicationContextProvider';
import { defaultLayerConf } from './config/layerconf';
import { layerMap } from './config/layermap';


const {
  BackgroundLayer,
  getShowMeasurementButton,
  setBackgroundLayer,
  setLayers,
  setShowFullscreenButton,
  setShowHamburgerMenu,
  setShowLocatorButton,
  setShowMeasurementButton,
} = sliceMapping;
const {
  getAllowUiChanges,
  setAllowUiChanges,
  setShowLayerButtons,
  setShowLayerHideButtons,
} = sliceUI;

if (typeof global === 'undefined') {
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
  const showMeasurementButton = useSelector(getShowMeasurementButton);
  const dispatch = useDispatch();

  useEffect(() => {
    if (searchParams.get('sync')) {
      setSyncToken(searchParams.get('sync'));
    }

    if (searchParams.get('data')) {
      const data = searchParams.get('data');
      const newConfig: Config = JSON.parse(
        LZString.decompressFromEncodedURIComponent(data)
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
      searchParams.delete('data');
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

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onKeyUp);

    return () => {
      document.removeEventListener('keydown', onKeyDown);

      document.removeEventListener('keyup', onKeyUp);

      window.removeEventListener('blur', onKeyUp);
    };
  }, [allowUiChanges]);

  const content = (
    <TopicMapContextProvider>
      <div className="flex flex-col h-screen w-full">
        {!published && <TopNavbar layerMap={layerMap} />}
        <HomeButton />
        {showMeasurementButton && <MapMeasurement />}
        <Map host={host} defaultLayerConfig={defaultLayerConf} />
      </div>
    </TopicMapContextProvider>
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
