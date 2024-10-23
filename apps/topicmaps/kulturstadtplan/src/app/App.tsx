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

import titleFactory from '../helper/titleFactory';
import createItemsDictionary from '../helper/createDictionary';
import itemFilterFunction from '../helper/filter';

export function App() {
  useEffect(() => {
    document.title = 'Kulturstadtplan Wuppertal';
  }, []);
  return (
    <TopicMapContextProvider
      appKey="KulturKarteWuppertal2022"
      featureItemsURL={
        'https://wupp-topicmaps-data.cismet.de/data/veranstaltungsorte.data.json'
      }
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      createFeatureItemsDictionary={createItemsDictionary}
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
        einrichtung: [],
        veranstaltung: [],
        mode: 'einrichtungen',
      }}
    >
      <Map />
    </TopicMapContextProvider>
  );
}

export default App;
