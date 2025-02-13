import TopicMapContextProvider, {
  TopicMapContext,
} from "react-cismap/contexts/TopicMapContextProvider";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent.js";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";
import { Card } from "antd";
import PropTypes from "prop-types";
import { useContext, useEffect, useRef, useState } from "react";
import { flaechen } from "../../stories/_data/rathausKassenzeichenfeatureCollection";
import { FeatureCollectionDisplay } from "react-cismap";
import { stylerGeometrienStyle } from "../../helper/utility";
import { getBoundsForFeatureArray } from "../../tools/mappingTools";

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
  const cardRef = useRef(null);
  const [mapWidth, setMapWidth] = useState(0);
  const [mapHeight, setMapHeight] = useState(0);

  const { routedMapRef, referenceSystem } = useContext(TopicMapContext);

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setMapWidth(cardRef?.current?.offsetWidth);
        setMapHeight(cardRef?.current?.offsetHeight);
      }
    });

    resizeObserver.observe(cardRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  function fitMapBounds() {
    const map = routedMapRef?.leafletMap?.leafletElement;
    if (map == undefined) {
      // console.log("xxx map is undefined");
      return;
    } else {
    }
    let bb = undefined;
    if (data?.featureCollection && data?.featureCollection.length > 0) {
      // console.log("xxx will use featureCollection", data?.featureCollection);

      bb = getBoundsForFeatureArray(data?.featureCollection);
    } else if (data?.allFeatures && data?.allFeatures.length > 0) {
      // console.log("xxx will use allFeatures", data?.allFeatures);
      bb = getBoundsForFeatureArray(data?.allFeatures);
    }

    if (map && bb) {
      map.fitBounds(bb);
      // console.log("xxx fitBounds");
    }
  }

  useEffect(() => {
    if (routedMapRef) {
      setTimeout(() => {
        fitMapBounds();
      }, 500);
    }
  }, [routedMapRef]);

  return (
    <div ref={cardRef} className="w-full h-80">
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
        autoFitBounds={true}
      >
        <FeatureCollectionDisplay
          featureCollection={data.featureCollection}
          style={data.styler}
        />
      </TopicMapComponent>
    </div>
  );
};
export default MapRender;
