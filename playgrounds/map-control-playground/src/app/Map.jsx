import React from 'react';
import TopicMapComponent from 'react-cismap/topicmaps/TopicMapComponent';
import { ControlLayout, Control, Main } from '@carma/map-control';
console.log('xxx', ControlLayout);
const Map = () => {
  return (
    <TopicMapComponent
      locatorControl={false}
      gazetteerSearchControl={false}
      hamburgerMenu={false}
      zoomControls={false}
      fullScreenControl={false}
      mapStyle={{ width: '100%', height: '90vh' }}
    ></TopicMapComponent>
  );
};

export default Map;