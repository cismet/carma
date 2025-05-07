import React from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
const Map = ({ mapStyle = {} }) => {
  return (
    <TopicMapComponent
      locatorControl={false}
      gazetteerSearchControl={false}
      hamburgerMenu={false}
      zoomControls={false}
      fullScreenControl={false}
      mapStyle={mapStyle}
    ></TopicMapComponent>
  );
};

export default Map;
