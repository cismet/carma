import React from 'react';
import { useContext, useEffect, useState } from 'react';
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from 'react-cismap/contexts/FeatureCollectionContextProvider';
import { TopicMapStylingContext } from 'react-cismap/contexts/TopicMapStylingContextProvider';
import FeatureCollection from 'react-cismap/FeatureCollection';
import TopicMapComponent from 'react-cismap/topicmaps/TopicMapComponent';
import {
  fotoKraemerCaptionFactory,
  fotoKraemerUrlManipulation,
  getGazData,
} from './helper/helper';
import Menu from './Menu';
import { getPoiClusterIconCreatorFunction } from './helper/styler';
import GenericInfoBoxFromFeature from 'react-cismap/topicmaps/GenericInfoBoxFromFeature';

const Map = () => {
  const [gazData, setGazData] = useState([]);
  const { setSelectedFeatureByPredicate, setClusteringOptions } = useContext(
    FeatureCollectionDispatchContext
  );
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions } = useContext(FeatureCollectionContext);
  useEffect(() => {
    getGazData(setGazData);
  }, []);

  useEffect(() => {
    if (markerSymbolSize) {
      setClusteringOptions({
        ...clusteringOptions,
        iconCreateFunction: getPoiClusterIconCreatorFunction,
      });
    }
  }, [markerSymbolSize]);

  return (
    <TopicMapComponent
      locatorControl={true}
      gazetteerSearchControl={false}
      hamburgerMenu={false}
      zoomControls={false}
      fullScreenControl={false}
    ></TopicMapComponent>
  );
};

export default Map;
