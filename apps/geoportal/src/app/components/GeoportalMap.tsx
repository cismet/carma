import { useEffect, useRef, useState } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { useSelector } from "react-redux";
import { getGazData, paramsToObject } from "../helper/helper.ts";
import {
  getBackgroundLayer,
  getFocusMode,
  getLayers,
  getShowFullscreenButton,
  getShowHamburgerMenu,
  getShowLocatorButton,
} from "../store/slices/mapping.ts";
import LayerWrapper from "./layers/LayerWrapper.tsx";
import InfoBoxMeasurement from "./map-measure/InfoBoxMeasurement.jsx";
import PaleOverlay from "react-cismap/PaleOverlay";
import StyledWMSTileLayer from "react-cismap/StyledWMSTileLayer";
import { useSearchParams } from "react-router-dom";
import { getBackgroundLayers } from "../helper/layer.tsx";
import { getMode, getShowLayerButtons } from "../store/slices/ui.ts";
import CismapLayer from "react-cismap/CismapLayer";
import { namedStyles, defaultLayerConfig } from "../config/index.ts";

export const GeoportalMap = () => {
  const [gazData, setGazData] = useState([]);
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const layers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const mode = useSelector(getMode);
  const showLayerButtons = useSelector(getShowLayerButtons);
  const showFullscreenButton = useSelector(getShowFullscreenButton);
  const showLocatorButton = useSelector(getShowLocatorButton);
  const showHamburgerMenu = useSelector(getShowHamburgerMenu);
  const focusMode = useSelector(getFocusMode);
  const [urlParams, setUrlParams] = useSearchParams();

  useEffect(() => {
    getGazData(setGazData);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (wrapperRef.current) {
        setHeight(wrapperRef.current.clientHeight);
        setWidth(wrapperRef.current.clientWidth);
      }
    };

    window.addEventListener("resize", handleResize);

    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="h-full w-full" ref={wrapperRef}>
      <TopicMapComponent
        gazData={gazData}
        hamburgerMenu={showHamburgerMenu}
        locatorControl={showLocatorButton}
        fullScreenControl={showFullscreenButton}
        mapStyle={{ width, height }}
        leafletMapProps={{ editable: true }}
        minZoom={5}
        backgroundlayers="empty"
        mappingBoundsChanged={(boundingbox) => {
          // console.log('xxx bbox', createWMSBbox(boundingbox));
        }}
        locationChangedHandler={(location) => {
          const newParams = { ...paramsToObject(urlParams), ...location };
          setUrlParams(newParams);
        }}
        gazetteerSearchPlaceholder="Stadtteil | Adresse | POI"
        infoBox={
          mode === "measurement" ? (
            <InfoBoxMeasurement key={mode} />
          ) : (
            <div></div>
          )
        }
      >
        {getBackgroundLayers({ layerString: backgroundLayer.layers })}
        {focusMode && <PaleOverlay />}
        {showLayerButtons && <LayerWrapper />}
        {layers.map((layer, i) => {
          if (layer.visible) {
            switch (layer.layerType) {
              case "wmts":
                return (
                  <CismapLayer
                    key={`${focusMode}_${i}_${layer.id}`}
                    url={layer.props.url}
                    maxZoom={26}
                    layers={layer.props.name}
                    format="image/png"
                    tiled={true}
                    transparent="true"
                    pane="additionalLayers1"
                    opacity={layer.opacity.toFixed(1) || 0.7}
                    type={"wmts"}
                  />
                );
              case "vector":
                return (
                  <CismapLayer
                    key={`${focusMode}_${i}_${layer.id}_${layer.opacity}`}
                    style={layer.props.style}
                    maxZoom={26}
                    pane={`additionalLayers${i}`}
                    opacity={layer.opacity || 0.7}
                    type="vector"
                  />
                );
            }
          } else {
            return <></>;
          }
        })}
      </TopicMapComponent>
    </div>
  );
};

export default GeoportalMap;
