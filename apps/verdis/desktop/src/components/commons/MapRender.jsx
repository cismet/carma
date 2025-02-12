import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent.js";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";
import { Card } from "antd";
import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { flaechen } from "../../stories/_data/rathausKassenzeichenfeatureCollection";
import { FeatureCollectionDisplay } from "react-cismap";
import { stylerGeometrienStyle } from "../../helper/utility";

const mockExtractor = (input) => {
  return {
    homeCenter: [51.27225612927373, 7.199918031692506],
    homeZoom: 16,
    featureCollection: flaechen,
    styler: stylerGeometrienStyle,
  };
};

const MapRender = ({ dataIn, extractor = mockExtractor }) => {
  const data = extractor(dataIn);
  const padding = 0;
  const cardRef = useRef(null);
  const [mapWidth, setMapWidth] = useState(0);
  const [mapHeight, setMapHeight] = useState(0);

  useEffect(() => {
    setMapWidth(cardRef?.current?.offsetWidth);
    setMapHeight(cardRef?.current?.offsetHeight);

    const setSize = () => {
      setMapWidth(cardRef?.current?.offsetWidth);
      setMapHeight(cardRef?.current?.offsetHeight);
    };

    window.addEventListener("resize", setSize);

    console.log("xxx first load", data.featureCollection);

    return () => window.removeEventListener("resize", setSize);
  }, []);

  return (
    <div ref={cardRef} className="w-full h-80">
      <TopicMapContextProvider appKey="verdis-desktop-render.map">
        <TopicMapComponent
          mapStyle={{
            width: mapWidth,
            height: mapHeight + 10,
          }}
          homeZoom={data.homeZoom}
          homeCenter={data.homeCenter}
          gazData={[]}
          gazetteerSearchControl={false}
          hamburgerMenu={false}
          fullScreenControl={false}
        >
          <FeatureCollectionDisplay
            featureCollection={data.featureCollection}
            style={data.styler}
          />
        </TopicMapComponent>
      </TopicMapContextProvider>
    </div>
  );
};
export default MapRender;
