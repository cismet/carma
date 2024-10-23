import { useEffect } from 'react';
import { MappingConstants } from 'react-cismap';
import TopicMapContextProvider from 'react-cismap/contexts/TopicMapContextProvider';

import 'bootstrap/dist/css/bootstrap.min.css';
import 'leaflet/dist/leaflet.css';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import 'react-cismap/topicMaps.css';
import Map from './components/Map';
import convertItemToFeature from '../helper/convertItemToFeature';
import {
  getFeatureStyler,
  getPoiClusterIconCreatorFunction,
} from '../helper/styler';
import itemFilterFunction from '../helper/filter';
import titleFactory from '../helper/titleFactory';

export function App() {
  useEffect(() => {
    document.title = 'E-Fahrrad-Karte Wuppertal';
  }, []);
  return (
    <TopicMapContextProvider
      appKey="EBikeKarteWuppertal2022"
      featureItemsURL={
        'https://wupp-topicmaps-data.cismet.de/data/ebikes.data.json'
      }
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      getFeatureStyler={getFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      titleFactory={titleFactory}
      convertItemToFeature={convertItemToFeature}
      clusteringOptions={{
        iconCreateFunction: getPoiClusterIconCreatorFunction(35),
      }}
      itemFilterFunction={itemFilterFunction}
      filterState={{
        stationsart: ['Ladestation', 'Verleihstation'],
        nur_online: false,
        immer_offen: false,
        gruener_strom: false,
        ladebox_zu: false,
      }}
    >
      <Map />
    </TopicMapContextProvider>
  );
}

export default App;
