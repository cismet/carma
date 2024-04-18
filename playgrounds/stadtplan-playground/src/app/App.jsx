import React from 'react';
import { useEffect } from 'react';
import { useState } from 'react';
import { MappingConstants } from 'react-cismap';
import TopicMapContextProvider from 'react-cismap/contexts/TopicMapContextProvider';

import { getConvertItemToFeatureWithPOIColors } from './helper/convertItemToFeature';
import createItemsDictionary from './helper/createItemsDistionary';
import itemFilterFunction from './helper/filter';
import { getPOIColors } from './helper/helper';
import {
  getFeatureStyler,
  getPoiClusterIconCreatorFunction,
} from './helper/styler';
import titleFactory from './helper/titleFactory';
import Stadtplankarte from './Stadtplankarte';
import './index.css';
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'leaflet/dist/leaflet.css';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import 'react-cismap/topicMaps.css';
if (typeof global === 'undefined') {
  window.global = window;
}

function App() {
  const [poiColors, setPoiColors] = useState();

  useEffect(() => {
    getPOIColors(setPoiColors);
    document.title = 'Online-Stadtplan Wuppertal';
  }, []);
  if (poiColors) {
    return (
      <TopicMapContextProvider
        appKey="OnlineStadtplanWuppertal2022"
        featureItemsURL={
          'https://wupp-topicmaps-data.cismet.de/data/poi.data.json'
        }
        createFeatureItemsDictionary={createItemsDictionary}
        getFeatureStyler={getFeatureStyler}
        convertItemToFeature={getConvertItemToFeatureWithPOIColors(poiColors)}
        itemFilterFunction={itemFilterFunction}
        titleFactory={titleFactory}
        referenceSystemDefinition={MappingConstants.proj4crs25832def}
        clusteringOptions={{
          iconCreateFunction: getPoiClusterIconCreatorFunction({
            svgSize: 35,
            poiColors,
          }),
        }}
        mapEPSGCode="25832"
        referenceSystem={MappingConstants.crs25832}
        additionalStylingInfo={{ poiColors }}
      >
        <Stadtplankarte poiColors={poiColors} />
      </TopicMapContextProvider>
    );
  } else {
    return <div>loading</div>;
  }
}

export default App;
