import React from 'react';
import TopicMapComponent from 'react-cismap/topicmaps/TopicMapComponent';

const Map = () => {
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
