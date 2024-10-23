import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

import { Card } from "antd";
import { useContext, useEffect, useRef, useState } from "react";
import { MappingConstants, RoutedMap } from "react-cismap";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import { useLocation, useSearchParams } from "react-router-dom";
import { createQueryGeomFromBB, getArea25832 } from "../../tools/mappingTools";

import {
  setBBPoly,
  setHoveredProperties,
  setLeafletElement,
} from "../../store/slices/mapping";
import { useDispatch } from "react-redux";
import Toolbar from "./Toolbar";
import LandparcelLayer from "./LandparcelLayer";

const mockExtractor = (input) => {
  return {
    homeCenter: [51.27225612927373, 7.199918031692506],
    homeZoom: 16,
  };
};

const Map = ({
  dataIn,
  extractor = mockExtractor,
  width = 400,
  height = 500,
  boundingBoxChangedHandler = () => {},
}) => {
  const dispatch = useDispatch();
  const [urlParams, setUrlParams] = useSearchParams();
  const [fallback, setFallback] = useState({});

  const data = extractor(dataIn);
  const padding = 5;
  const headHeight = 37;
  const toolBarHeight = 34;
  const cardRef = useRef(null);
  const [mapWidth, setMapWidth] = useState(0);
  const [mapHeight, setMapHeight] = useState(0);
  const { selectedBackground, backgroundConfigurations } = useContext(
    TopicMapStylingContext
  );

  let backgroundsFromMode;
  const browserlocation = useLocation();
  function paramsToObject(entries) {
    const result = {};
    for (const [key, value] of entries) {
      // each 'entry' is a [key, value] tupple
      result[key] = value;
    }
    return result;
  }
  const urlSearchParams = new URLSearchParams(browserlocation.search);
  const urlSearchParamsObject = paramsToObject(urlParams);
  try {
    backgroundsFromMode = backgroundConfigurations[selectedBackground].layerkey;
  } catch (e) {}

  const _backgroundLayers = backgroundsFromMode || "rvrGrau@40";

  useEffect(() => {
    setMapWidth(cardRef?.current?.offsetWidth);
    setMapHeight(cardRef?.current?.offsetHeight);

    const setSize = () => {
      setMapWidth(cardRef?.current?.offsetWidth);
      setMapHeight(cardRef?.current?.offsetHeight);
    };

    window.addEventListener("resize", setSize);

    return () => window.removeEventListener("resize", setSize);
  }, []);

  let refRoutedMap = useRef(null);

  const mapStyle = {
    width: mapWidth - 2.5 * padding,
    height: mapHeight - 2 * padding - headHeight - toolBarHeight,
    cursor: "pointer",
    clear: "both",
    zIndex: 1,
  };

  useEffect(() => {
    if (refRoutedMap.current) {
      const map = refRoutedMap.current.leafletMap.leafletElement;
      dispatch(setLeafletElement(map));
    }
  }, [refRoutedMap]);

  return (
    <Card
      size="small"
      hoverable={false}
      title={<span className="text-lg">Karte</span>}
      style={{
        width: width,
        height: height,
      }}
      bodyStyle={{ padding }}
      headStyle={{ backgroundColor: "white" }}
      type="inner"
      ref={cardRef}
    >
      <RoutedMap
        editable={false}
        style={mapStyle}
        key={"leafletRoutedMap"}
        backgroundlayers={_backgroundLayers}
        urlSearchParams={urlSearchParams}
        layers=""
        referenceSystem={MappingConstants.crs3857}
        referenceSystemDefinition={MappingConstants.proj4crs3857def}
        ref={refRoutedMap}
        minZoom={11}
        maxZoom={25}
        zoomSnap={0.5}
        zoomDelta={0.5}
        fallbackPosition={{
          lat:
            urlSearchParamsObject?.lat ??
            fallback?.position?.lat ??
            51.272570027476256,
          lng:
            urlSearchParamsObject?.lng ??
            fallback?.position?.lng ??
            7.19963690266013,
        }}
        fallbackZoom={urlSearchParamsObject?.zoom ?? fallback.zoom ?? 17}
        locationChangedHandler={(location) => {
          const newParams = { ...paramsToObject(urlParams), ...location };
          setUrlParams(newParams);
        }}
        boundingBoxChangedHandler={(boundingBox) => {
          boundingBoxChangedHandler(boundingBox);
          try {
            const bbPoly = createQueryGeomFromBB(boundingBox);
            const area = getArea25832(bbPoly);
            const maxAreaForSearch = 130000;
            if (area < maxAreaForSearch && area !== 0) {
              dispatch(setBBPoly(bbPoly));
            } else {
              dispatch(setBBPoly(undefined));
              dispatch(setHoveredProperties({}));
            }
          } catch (e) {
            console.log("error in boundingBoxChangedHandler", e);
          }
        }}
        ondblclick={(event) => {
          //if data contains a ondblclick handler, call it
          if (data.ondblclick) {
            data.ondblclick(event);
          }
        }}
      >
        <LandparcelLayer />
      </RoutedMap>
      <Toolbar />
    </Card>
  );
};
export default Map;
