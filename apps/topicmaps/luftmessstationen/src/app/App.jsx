import React, { useContext, useEffect } from 'react';

import './App.css';
import { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'leaflet/dist/leaflet.css';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import 'react-cismap/topicMaps.css';
import TopicMapContextProvider from 'react-cismap/contexts/TopicMapContextProvider';
import TopicMapComponent from 'react-cismap/topicmaps/TopicMapComponent';
import FeatureCollection from 'react-cismap/FeatureCollection';
import GenericInfoBoxFromFeature from 'react-cismap/topicmaps/GenericInfoBoxFromFeature';

import getGTMFeatureStyler from 'react-cismap/topicmaps/generic/GTMStyler';
import ContactButton from 'react-cismap/ContactButton';
import convertItemToFeature, { getStatus } from './helper/convertItemToFeature';

import { getClusterIconCreatorFunction } from 'react-cismap/tools/uiHelper';
import MyMenu from './Menu';
import LogSelection from './helper/LogSelectedFeature';
import UWZ from './Umweltzonenlayer';
import itemFilterFunction from './helper/filterFunction';
import { LOOKUP } from './helper/constants';
import { getGazData } from './helper/getGazData';
import titleFactory from './helper/titleFactory';
import InfoPanel from './SecondaryInfo';
import { MappingConstants } from 'react-cismap';
import Luftmessstationskarte from './Luftmessstationskarte';

function App() {
  const [gazData, setGazData] = useState([]);
  useEffect(() => {
    getGazData(setGazData);
    document.title = 'Luftmessstationskarte Wuppertal';
  }, []);

  return (
    <TopicMapContextProvider
      appKey="LuftmessstationenWuppertal.TopicMap"
      featureItemsURL={
        'https://wupp-topicmaps-data.cismet.de/data/no2.data.json'
      }
      // featureItemsURL={"/data/no2.data.json"} //for dev purpose only
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      getFeatureStyler={getGTMFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      convertItemToFeature={convertItemToFeature}
      clusteringOptions={{
        iconCreateFunction: getClusterIconCreatorFunction(
          30,
          (props) => props.color
        ),
      }}
      additionalLayerConfiguration={{
        uwz: {
          title: 'Umweltzone',
          initialActive: true,
          layer: <UWZ />,
        },
      }}
      filterState={{
        stations: [
          'unauffaellig',
          'auffaellig',
          'warnend',
          'inaktiv',
          'abgebaut',
        ],
      }}
      titleFactory={titleFactory}
      itemFilterFunction={itemFilterFunction}
      classKeyFunction={(item) => LOOKUP[getStatus(item)].title}
      getColorFromProperties={(item) => LOOKUP[getStatus(item)].color}
    >
      <Luftmessstationskarte />
    </TopicMapContextProvider>
  );
}

export default App;
