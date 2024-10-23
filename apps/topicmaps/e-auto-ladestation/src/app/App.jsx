import React from 'react';
import { useEffect } from 'react';
import { useState } from 'react';
import { MappingConstants } from 'react-cismap';
import TopicMapContextProvider from 'react-cismap/contexts/TopicMapContextProvider';

import convertItemToFeature, {
  getConvertItemToFeatureWithPOIColors,
} from './helper/convertItemToFeature';

import itemFilterFunction from './helper/filter';
import { getPOIColors } from './helper/helper';
import {
  getPoiClusterIconCreatorFunction,
  getFeatureStyler,
} from './helper/styler';
import titleFactory from './helper/titleFactory';
import EMobiKarte from './EMobiKarte';
import './index.css';
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'leaflet/dist/leaflet.css';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import 'react-cismap/topicMaps.css';
import { createItemsDictionary } from './helper/createItemsDictionary';
if (typeof global === 'undefined') {
  window.global = window;
}

function App() {
  const [poiColors, setPoiColors] = useState();

  useEffect(() => {
    getPOIColors(setPoiColors);
    document.title = 'E-Auto-Ladestationskarte Wuppertal';
  }, []);
  if (poiColors) {
    return (
      <TopicMapContextProvider
        appKey="OnlineEMobilitaetsskarteWuppertal2022"
        featureItemsURL={
          'https://wupp-topicmaps-data.cismet.de/data/emob.data.json'
        }
        createFeatureItemsDictionary={createItemsDictionary}
        referenceSystemDefinition={MappingConstants.proj4crs25832def}
        mapEPSGCode="25832"
        referenceSystem={MappingConstants.crs25832}
        getFeatureStyler={getFeatureStyler}
        featureTooltipFunction={(feature) => feature?.text}
        convertItemToFeature={convertItemToFeature}
        clusteringOptions={{
          iconCreateFunction: getPoiClusterIconCreatorFunction({ svgSize: 35 }),
        }}
        titleFactory={titleFactory}
        itemFilterFunction={itemFilterFunction}
        additionalStylingInfo={{ poiColors }}
      >
        <EMobiKarte />
      </TopicMapContextProvider>
    );
  } else {
    return <div>loading</div>;
  }
}

export default App;
