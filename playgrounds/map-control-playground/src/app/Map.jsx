import React from 'react';
import TopicMapComponent from 'react-cismap/topicmaps/TopicMapComponent';
import { ControlLayout, Control, Main } from '@carma/map-control';
const Map = ({ width, height }) => {
  console.log('rrr mapStyle', width, height);
  return (
    <TopicMapComponent
      locatorControl={false}
      gazetteerSearchControl={false}
      hamburgerMenu={false}
      zoomControls={false}
      fullScreenControl={false}
      mapStyle={{ width: `${width / 2}px`, height: `${height / 2}px` }}
    ></TopicMapComponent>
  );
};

export default Map;
