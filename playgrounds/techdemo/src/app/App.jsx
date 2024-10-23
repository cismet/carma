import { useEffect } from 'react';

import './App.css';
import { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'leaflet/dist/leaflet.css';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import 'react-cismap/topicMaps.css';
import { md5FetchText, fetchJSON } from 'react-cismap/tools/fetching';
import { getGazDataForTopicIds } from 'react-cismap/tools/gazetteerHelper';
import LogConsole from 'react-cismap/tools/LogConsole';
import TopicMapContextProvider from 'react-cismap/contexts/TopicMapContextProvider';
import { getClusterIconCreatorFunction } from 'react-cismap/tools/uiHelper';
import TopicMapComponent from 'react-cismap/topicmaps/TopicMapComponent';
import FeatureCollection from 'react-cismap/FeatureCollection';
import GenericInfoBoxFromFeature from 'react-cismap/topicmaps/GenericInfoBoxFromFeature';
import getGTMFeatureStyler from 'react-cismap/topicmaps/generic/GTMStyler';
// import ImprovedLocatorControl from "./ImprovedLocatorControl";
import StyledWMSTileLayer from 'react-cismap/StyledWMSTileLayer';
import { defaultLayerConf } from 'react-cismap/tools/layerFactory';
const host = 'https://wupp-topicmaps-data.cismet.de';

const getGazData = async (setGazData) => {
  const prefix = 'GazDataForStories';
  const sources = {};

  sources.adressen = await md5FetchText(
    prefix,
    host + '/data/3857/adressen.json'
  );
  sources.bezirke = await md5FetchText(
    prefix,
    host + '/data/3857/bezirke.json'
  );
  sources.quartiere = await md5FetchText(
    prefix,
    host + '/data/3857/quartiere.json'
  );
  sources.pois = await md5FetchText(prefix, host + '/data/3857/pois.json');
  sources.kitas = await md5FetchText(prefix, host + '/data/3857/kitas.json');

  const gazData = getGazDataForTopicIds(sources, [
    'pois',
    'kitas',
    'bezirke',
    'quartiere',
    'adressen',
  ]);

  setGazData(gazData);
};

const backgroundModes = [
  {
    title: 'Stadtplan',
    mode: 'default',
    layerKey: 'stadtplan',
  },
  {
    title: 'Stadtplan (Vektordaten )',
    mode: 'default',
    layerKey: 'vector2',
  },
  {
    title: 'Stadtplan (Vektordaten light)',
    mode: 'default',
    layerKey: 'vector',
  },

  { title: 'Luftbildkarte', mode: 'default', layerKey: 'lbk' },
];
const backgroundConfigurations = {
  lbk: {
    layerkey: 'cismetText|trueOrtho2020@40',
    layerkey_: 'wupp-plan-live@100|trueOrtho2020@75|rvrSchrift@100',
    src: '/images/rain-hazard-map-bg/ortho.png',
    title: 'Luftbildkarte',
  },
  stadtplan: {
    layerkey: 'wupp-plan-live@60',
    src: '/images/rain-hazard-map-bg/citymap.png',
    title: 'Stadtplan',
  },
  vector: {
    layerkey: 'cismetLight',
    src: '/images/rain-hazard-map-bg/citymap.png',
    title: 'Stadtplan',
  },
  vector2: {
    layerkey: 'OMT_OSM_bright',
    src: '/images/rain-hazard-map-bg/citymap.png',
    title: 'Stadtplan',
  },
};
const baseLayerConf = { ...defaultLayerConf };

baseLayerConf.namedLayers.cismetLight = {
  type: 'vector',
  style: 'https://omt.map-hosting.de/styles/cismet-light/style.json',
  pane: 'backgroundvectorLayers',
};

function App() {
  const [gazData, setGazData] = useState([]);
  useEffect(() => {
    getGazData(setGazData);
    // consolere.connect({ server: "http://localhost:8088", channel: "test" });
  }, []);

  return (
    <TopicMapContextProvider
      baseLayerConf={baseLayerConf}
      backgroundConfigurations={backgroundConfigurations}
      backgroundModes={backgroundModes}
    >
      <TopicMapComponent locatorControl={true} gazData={gazData}>
        {/* <LogConsole
          style={{ textAlign: "left" }}
          ghostModeAvailable={true}
          minifyAvailable={true}
        /> */}
        {/* <ImprovedLocatorControl /> */}
      </TopicMapComponent>
    </TopicMapContextProvider>
  );
}

export default App;
